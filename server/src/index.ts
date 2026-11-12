import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import express from 'express'; import cors from 'cors'; import helmet from 'helmet'; import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs'; import jwt from 'jsonwebtoken'; import { z } from 'zod';
import { pool } from './db.js'; import { requireAuth, allow, AuthRequest } from './auth.js';
export const app=express(); app.use(helmet()); app.use(cors({origin:process.env.FRONTEND_ORIGIN ? process.env.FRONTEND_ORIGIN.split(',') : false})); app.use(express.json({limit:'30kb'}));
app.use('/api/auth',rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:true,legacyHeaders:false}));
const asyncRoute=(fn:(req:any,res:any)=>Promise<any>)=>(req:any,res:any,next:any)=>Promise.resolve(fn(req,res)).catch(next);

const notify=async(userId:string,title:string,body?:string)=>{
  try{await pool.query(`INSERT INTO notifications(user_id,title,body) VALUES($1,$2,$3)`,[userId,title,body||null]);}catch(e){console.error('notify failed',e);}
};

const signupSchema=z.object({fullName:z.string().trim().min(2).max(140),email:z.string().email().max(255),password:z.string().min(10).max(128),role:z.enum(['student','driver'])});
app.get('/api/health',asyncRoute(async(_req,res)=>{await pool.query('SELECT 1');res.json({status:'ok',database:'connected'});}));
app.post('/api/auth/register',asyncRoute(async(req,res)=>{const p=signupSchema.parse(req.body);const email=p.email.toLowerCase();const exists=await pool.query('SELECT 1 FROM users WHERE email=$1',[email]);if(exists.rowCount)return res.status(409).json({error:'An account with this email already exists'});const hash=await bcrypt.hash(p.password,12);const status=p.role==='driver'?'pending':'active';const r=await pool.query('INSERT INTO users(full_name,email,password_hash,role,status) VALUES($1,$2,$3,$4,$5) RETURNING id,full_name,email,role,status',[p.fullName,email,hash,p.role,status]);res.status(201).json({user:r.rows[0],message:p.role==='driver'?'Driver account submitted for approval':'Account created'});}));
app.post('/api/auth/login',asyncRoute(async(req,res)=>{const p=z.object({email:z.string().email(),password:z.string().min(1)}).parse(req.body);const r=await pool.query('SELECT * FROM users WHERE email=$1',[p.email.toLowerCase()]);const u=r.rows[0];if(!u||!(await bcrypt.compare(p.password,u.password_hash)))return res.status(401).json({error:'Invalid email or password'});if(u.status!=='active')return res.status(403).json({error:'Your account is not active. Contact the administrator.'});const token=jwt.sign({id:u.id,role:u.role,status:u.status},process.env.JWT_SECRET!,{expiresIn:'8h'});res.json({token,user:{id:u.id,fullName:u.full_name,email:u.email,role:u.role}});}));
app.get('/api/me',requireAuth,asyncRoute(async(req:AuthRequest,res)=>{const r=await pool.query('SELECT id,full_name,email,role,status,is_online,created_at FROM users WHERE id=$1',[req.user!.id]);res.json({user:r.rows[0]});}));
app.get('/api/locations',requireAuth,asyncRoute(async(_req,res)=>{const r=await pool.query('SELECT id,name,zone FROM locations WHERE active=TRUE ORDER BY name');res.json({locations:r.rows});}));
app.get('/api/fares',requireAuth,asyncRoute(async(_req,res)=>{const r=await pool.query('SELECT base_fare,per_zone_fare,updated_at FROM fare_settings WHERE active=TRUE ORDER BY updated_at DESC LIMIT 1');res.json({fare:r.rows[0]||null});}));
app.post('/api/bookings',requireAuth,allow('student'),asyncRoute(async(req:AuthRequest,res)=>{const p=z.object({pickupId:z.string().uuid(),destinationId:z.string().uuid(),note:z.string().max(500).optional(),preferredDriverId:z.string().uuid().optional(),scheduledAt:z.string().datetime().optional()}).parse(req.body);if(p.pickupId===p.destinationId)return res.status(400).json({error:'Pickup and destination must be different'});const client=await pool.connect();try{await client.query('BEGIN');const loc=await client.query('SELECT id FROM locations WHERE id=ANY($1::uuid[]) AND active=TRUE',[ [p.pickupId,p.destinationId] ]);if(loc.rowCount!==2){await client.query('ROLLBACK');return res.status(400).json({error:'Invalid or inactive location'});}const fare=await client.query('SELECT base_fare,per_zone_fare FROM fare_settings WHERE active=TRUE ORDER BY updated_at DESC LIMIT 1');if(!fare.rowCount){await client.query('ROLLBACK');return res.status(503).json({error:'Fare settings are not configured'});}const f=Number(fare.rows[0].base_fare);const ref='CT-'+randomBytes(5).toString('hex').toUpperCase();const b=await client.query(`INSERT INTO bookings(reference,student_id,pickup_id,destination_id,note,preferred_driver_id,scheduled_at,estimated_fare) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[ref,req.user!.id,p.pickupId,p.destinationId,p.note||null,p.preferredDriverId||null,p.scheduledAt||null,f]);await client.query('INSERT INTO payment_records(booking_id,amount) VALUES($1,$2)',[b.rows[0].id,f]);await client.query('COMMIT');
  const booking=b.rows[0];
  if(p.preferredDriverId) await notify(p.preferredDriverId,'New ride request for you', 'A student requested you for booking '+booking.reference);
  else {
    // notify all online drivers (best-effort, limited)
    const online=await pool.query(`SELECT id FROM users WHERE role='driver' AND status='active' AND is_online=TRUE LIMIT 20`);
    for(const d of online.rows) await notify(d.id,'New ride request','Booking '+booking.reference+' is waiting');
  }
  res.status(201).json({booking});}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}));
app.get('/api/bookings',requireAuth,asyncRoute(async(req:AuthRequest,res)=>{let sql='SELECT b.*, p.name pickup, d.name destination, u.full_name student_name, pr.status payment_status FROM bookings b JOIN locations p ON p.id=b.pickup_id JOIN locations d ON d.id=b.destination_id JOIN users u ON u.id=b.student_id LEFT JOIN payment_records pr ON pr.booking_id=b.id';let args:any[]=[];if(req.user!.role==='student'){sql+=' WHERE b.student_id=$1';args=[req.user!.id];}else if(req.user!.role==='driver'){sql+=' WHERE (b.driver_id=$1 OR (b.driver_id IS NULL AND b.status=\'pending\'))';args=[req.user!.id];}sql+=' ORDER BY b.created_at DESC LIMIT 100';const r=await pool.query(sql,args);res.json({bookings:r.rows});}));
app.patch('/api/bookings/:id/accept',requireAuth,allow('driver'),asyncRoute(async(req:AuthRequest,res)=>{const r=await pool.query(`UPDATE bookings SET driver_id=$1,status='accepted',updated_at=NOW() WHERE id=$2 AND status='pending' AND driver_id IS NULL AND EXISTS(SELECT 1 FROM users WHERE id=$1 AND status='active') RETURNING *`,[req.user!.id,req.params.id]);if(!r.rowCount)return res.status(409).json({error:'Booking is no longer available'});const b=r.rows[0];await notify(b.student_id,'Ride accepted','A driver has accepted your booking '+b.reference);res.json({booking:b});}));
app.patch('/api/bookings/:id/status',requireAuth,allow('driver','admin'),asyncRoute(async(req:AuthRequest,res)=>{const p=z.object({status:z.enum(['driver_arriving','in_progress','completed','cancelled','rejected'])}).parse(req.body);const allowedFrom:Record<string,string[]>={driver_arriving:['accepted'],in_progress:['driver_arriving'],completed:['in_progress'],cancelled:['accepted','driver_arriving','in_progress'],rejected:['pending']};const r=await pool.query(`UPDATE bookings SET status=$1,updated_at=NOW() WHERE id=$2 AND (driver_id=$3 OR $4='admin') AND status=ANY($5::text[]) RETURNING *`,[p.status,req.params.id,req.user!.id,req.user!.role,allowedFrom[p.status]||[]]);if(!r.rowCount)return res.status(409).json({error:'Booking cannot be updated by this account'});const b=r.rows[0];
  if(p.status==='driver_arriving') await notify(b.student_id,'Driver arriving','Your driver is on the way for '+b.reference);
  if(p.status==='in_progress') await notify(b.student_id,'Trip started','Your ride '+b.reference+' is in progress');
  if(p.status==='completed') await notify(b.student_id,'Trip completed','Please rate your ride '+b.reference);
  res.json({booking:b});}));
app.patch('/api/bookings/:id/decline',requireAuth,allow('driver'),asyncRoute(async(req:AuthRequest,res)=>{
  const r=await pool.query(
    `UPDATE bookings SET status='rejected', updated_at=NOW()
     WHERE id=$1 AND status='pending'
       AND (preferred_driver_id=$2 OR preferred_driver_id IS NULL AND driver_id IS NULL)
     RETURNING *`,
    [req.params.id, req.user!.id]);
  // For open requests: only reject if this driver was preferred; otherwise soft-skip by not changing
  // Simpler campus behaviour: any driver can reject a pending request they see
  if(!r.rowCount){
    const r2=await pool.query(
      `UPDATE bookings SET status='rejected', updated_at=NOW()
       WHERE id=$1 AND status='pending' AND driver_id IS NULL RETURNING *`,
      [req.params.id]);
    if(!r2.rowCount) return res.status(409).json({error:'Booking is no longer pending'});
    const b=r2.rows[0];
    await notify(b.student_id,'Ride declined','A driver declined booking '+b.reference+'. Please request again.');
    return res.json({booking:b});
  }
  const b=r.rows[0];
  await notify(b.student_id,'Ride declined','Driver declined booking '+b.reference+'. Please request again.');
  res.json({booking:b});
}));

app.patch('/api/bookings/:id/cancel',requireAuth,allow('student'),asyncRoute(async(req:AuthRequest,res)=>{const r=await pool.query(`UPDATE bookings SET status='cancelled',updated_at=NOW() WHERE id=$1 AND student_id=$2 AND status='pending' RETURNING *`,[req.params.id,req.user!.id]);if(!r.rowCount)return res.status(409).json({error:'Only pending bookings can be cancelled'});res.json({booking:r.rows[0]});}));
app.patch('/api/bookings/:id/payment',requireAuth,allow('driver','admin'),asyncRoute(async(req:AuthRequest,res)=>{const p=z.object({status:z.enum(['reported','confirmed','disputed'])}).parse(req.body);if(p.status==='confirmed'&&req.user!.role!=='admin')return res.status(403).json({error:'Only an administrator can confirm a cash payment'});const r=await pool.query(`UPDATE payment_records pr SET status=$1,reported_by=CASE WHEN $1='reported' THEN $2 ELSE reported_by END,confirmed_by=CASE WHEN $1='confirmed' THEN $2 ELSE confirmed_by END,updated_at=NOW() FROM bookings b WHERE pr.booking_id=b.id AND b.id=$3 AND (b.driver_id=$2 OR $4='admin') RETURNING pr.*`,[p.status,req.user!.id,req.params.id,req.user!.role]);if(!r.rowCount)return res.status(404).json({error:'Payment record not found'});res.json({payment:r.rows[0]});}));
app.get('/api/admin/overview',requireAuth,allow('admin'),asyncRoute(async(_req,res)=>{const r=await pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status IN ('pending','accepted','driver_arriving','in_progress'))::int active,COUNT(*) FILTER(WHERE status='completed')::int completed,COUNT(*) FILTER(WHERE status='cancelled')::int cancelled FROM bookings`);const u=await pool.query(`SELECT role,status,COUNT(*)::int count FROM users GROUP BY role,status ORDER BY role,status`);res.json({bookings:r.rows[0],users:u.rows});}));
app.get('/api/admin/drivers',requireAuth,allow('admin'),asyncRoute(async(_req,res)=>{const r=await pool.query(`SELECT id,full_name,email,status,created_at FROM users WHERE role='driver' ORDER BY created_at DESC`);res.json({drivers:r.rows});}));
app.patch('/api/admin/drivers/:id/approval',requireAuth,allow('admin'),asyncRoute(async(req:AuthRequest,res)=>{const p=z.object({status:z.enum(['active','rejected','suspended'])}).parse(req.body);const r=await pool.query(`UPDATE users SET status=$1 WHERE id=$2 AND role='driver' RETURNING id,full_name,email,status`,[p.status,req.params.id]);if(!r.rowCount)return res.status(404).json({error:'Driver account not found'});await pool.query(`INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES($1,$2,'user',$3,$4)`,[req.user!.id,'driver_'+p.status,req.params.id,JSON.stringify({status:p.status})]);res.json({driver:r.rows[0]});}));
app.patch('/api/admin/fares',requireAuth,allow('admin'),asyncRoute(async(req:AuthRequest,res)=>{const p=z.object({baseFare:z.number().min(0),perZoneFare:z.number().min(0).default(0)}).parse(req.body);await pool.query('UPDATE fare_settings SET active=FALSE WHERE active=TRUE');const r=await pool.query('INSERT INTO fare_settings(base_fare,per_zone_fare,updated_by) VALUES($1,$2,$3) RETURNING *',[p.baseFare,p.perZoneFare,req.user!.id]);res.json({fare:r.rows[0]});}));

// Rating a completed booking (student)
app.patch('/api/bookings/:id/rating',requireAuth,allow('student'),asyncRoute(async(req:AuthRequest,res)=>{
  const p=z.object({rating:z.number().int().min(1).max(5),comment:z.string().max(200).optional()}).parse(req.body);
  const r=await pool.query(
    `UPDATE bookings SET rating=$1, rating_comment=$2, updated_at=NOW()
     WHERE id=$3 AND student_id=$4 AND status='completed' AND rating IS NULL
     RETURNING id,rating,rating_comment`,
    [p.rating,p.comment||null,req.params.id,req.user!.id]);
  if(!r.rowCount) return res.status(404).json({error:'Booking not found or already rated'});
  res.json({booking:r.rows[0]});
}));

// Simple profile name update
app.patch('/api/me',requireAuth,asyncRoute(async(req:AuthRequest,res)=>{
  const p=z.object({fullName:z.string().trim().min(2).max(140)}).parse(req.body);
  const r=await pool.query(
    `UPDATE users SET full_name=$1, updated_at=NOW() WHERE id=$2
     RETURNING id,full_name,email,role,status,created_at`,
    [p.fullName,req.user!.id]);
  res.json({user:r.rows[0]});
}));

// Vehicle registration / update for drivers
app.post('/api/vehicles',requireAuth,allow('driver'),asyncRoute(async(req:AuthRequest,res)=>{
  const p=z.object({
    registrationNumber:z.string().trim().min(2).max(40),
    make:z.string().trim().max(80).optional(),
    colour:z.string().trim().max(50).optional(),
    capacity:z.number().int().min(1).max(6).default(3)
  }).parse(req.body);
  const existing=await pool.query('SELECT id FROM vehicles WHERE driver_id=$1',[req.user!.id]);
  let r;
  if(existing.rowCount){
    r=await pool.query(
      `UPDATE vehicles SET registration_number=$1, make=$2, colour=$3, capacity=$4, approved=FALSE
       WHERE driver_id=$5 RETURNING *`,
      [p.registrationNumber,p.make||null,p.colour||null,p.capacity,req.user!.id]);
  } else {
    r=await pool.query(
      `INSERT INTO vehicles(driver_id,registration_number,make,colour,capacity)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [req.user!.id,p.registrationNumber,p.make||null,p.colour||null,p.capacity]);
  }
  res.status(201).json({vehicle:r.rows[0]});
}));

app.get('/api/vehicles/me',requireAuth,allow('driver'),asyncRoute(async(req:AuthRequest,res)=>{
  const r=await pool.query('SELECT * FROM vehicles WHERE driver_id=$1',[req.user!.id]);
  res.json({vehicle:r.rows[0]||null});
}));


// Change password
app.post('/api/auth/change-password',requireAuth,asyncRoute(async(req:AuthRequest,res)=>{
  const p=z.object({currentPassword:z.string().min(1),newPassword:z.string().min(10).max(128)}).parse(req.body);
  const r=await pool.query('SELECT password_hash FROM users WHERE id=$1',[req.user!.id]);
  const u=r.rows[0];
  if(!u||!(await bcrypt.compare(p.currentPassword,u.password_hash))) return res.status(401).json({error:'Current password is incorrect'});
  const hash=await bcrypt.hash(p.newPassword,12);
  await pool.query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2',[hash,req.user!.id]);
  await pool.query(`INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES($1,'password_changed','user',$2,'{}')`,[req.user!.id,req.user!.id]);
  res.json({message:'Password updated successfully'});
}));

// Notifications
app.get('/api/notifications',requireAuth,asyncRoute(async(req:AuthRequest,res)=>{
  const r=await pool.query(
    `SELECT id,title,body,read,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
    [req.user!.id]);
  const unread=await pool.query(`SELECT COUNT(*)::int AS c FROM notifications WHERE user_id=$1 AND read=FALSE`,[req.user!.id]);
  res.json({notifications:r.rows, unread: unread.rows[0].c});
}));

app.patch('/api/notifications/read',requireAuth,asyncRoute(async(req:AuthRequest,res)=>{
  const p=z.object({ids:z.array(z.string().uuid()).optional(), all:z.boolean().optional()}).parse(req.body||{});
  if(p.all){
    await pool.query(`UPDATE notifications SET read=TRUE WHERE user_id=$1 AND read=FALSE`,[req.user!.id]);
  } else if(p.ids && p.ids.length){
    await pool.query(`UPDATE notifications SET read=TRUE WHERE user_id=$1 AND id = ANY($2::uuid[])`,[req.user!.id,p.ids]);
  }
  res.json({ok:true});
}));

// Enhanced admin overview
app.get('/api/admin/stats',requireAuth,allow('admin'),asyncRoute(async(_req,res)=>{
  const bookings=await pool.query(`
    SELECT COUNT(*)::int total,
           COUNT(*) FILTER(WHERE status IN ('pending','accepted','driver_arriving','in_progress'))::int active,
           COUNT(*) FILTER(WHERE status='completed')::int completed,
           COUNT(*) FILTER(WHERE status='cancelled')::int cancelled,
           COUNT(*) FILTER(WHERE status='pending')::int pending,
           COALESCE(SUM(final_fare) FILTER(WHERE status='completed'),0)::float revenue
    FROM bookings`);
  const users=await pool.query(`SELECT role,status,COUNT(*)::int count FROM users GROUP BY role,status ORDER BY role,status`);
  const ratings=await pool.query(`SELECT COALESCE(AVG(rating),0)::float avg_rating, COUNT(rating)::int rated_trips FROM bookings WHERE rating IS NOT NULL`);
  const recent=await pool.query(`
    SELECT b.reference, b.status, b.estimated_fare, b.created_at, b.rating,
           s.full_name AS student_name, d.full_name AS driver_name,
           lp.name AS pickup, ld.name AS destination
    FROM bookings b
    JOIN users s ON s.id=b.student_id
    LEFT JOIN users d ON d.id=b.driver_id
    JOIN locations lp ON lp.id=b.pickup_id
    JOIN locations ld ON ld.id=b.destination_id
    ORDER BY b.created_at DESC LIMIT 12`);
  res.json({bookings:bookings.rows[0], users:users.rows, ratings:ratings.rows[0], recent:recent.rows});
}));


// Driver online toggle
app.patch('/api/me/online',requireAuth,allow('driver'),asyncRoute(async(req:AuthRequest,res)=>{
  const p=z.object({online:z.boolean()}).parse(req.body);
  const r=await pool.query(`UPDATE users SET is_online=$1, updated_at=NOW() WHERE id=$2 AND role='driver' RETURNING id,is_online`,[p.online,req.user!.id]);
  if(!r.rowCount) return res.status(404).json({error:'Driver not found'});
  res.json({online:r.rows[0].is_online});
}));

// List available drivers (online + active + approved vehicle optional)
app.get('/api/drivers/available',requireAuth,allow('student','admin'),asyncRoute(async(_req,res)=>{
  const r=await pool.query(`
    SELECT u.id, u.full_name, u.is_online,
           v.registration_number, v.make, v.colour, v.capacity, v.approved,
           COALESCE(AVG(b.rating),0)::float AS avg_rating,
           COUNT(b.rating)::int AS rating_count
    FROM users u
    LEFT JOIN vehicles v ON v.driver_id=u.id
    LEFT JOIN bookings b ON b.driver_id=u.id AND b.rating IS NOT NULL
    WHERE u.role='driver' AND u.status='active' AND u.is_online=TRUE
    GROUP BY u.id, u.full_name, u.is_online, v.registration_number, v.make, v.colour, v.capacity, v.approved
    ORDER BY avg_rating DESC, u.full_name`);
  res.json({drivers:r.rows});
}));

app.use((err:any,_req:any,res:any,_next:any)=>{if(err instanceof z.ZodError)return res.status(400).json({error:'Invalid request',details:err.issues});console.error(err);res.status(500).json({error:'Internal server error'});});
if (process.env.NODE_ENV !== 'production' && process.env.VERCEL !== '1') { const port=Number(process.env.PORT||4000); app.listen(port,()=>console.log(`CampusTrike API listening on ${port}`)); }
export default app;
