import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
export type Role = 'student'|'driver'|'admin';
export interface AuthRequest extends Request { user?: { id:string; role:Role; status:string } }
export function requireAuth(req:AuthRequest,res:Response,next:NextFunction){
 const token=req.header('authorization')?.replace(/^Bearer\s+/i,'');
 if(!token) return res.status(401).json({error:'Authentication required'});
 try { req.user=jwt.verify(token,process.env.JWT_SECRET!) as AuthRequest['user']; next(); }
 catch { return res.status(401).json({error:'Invalid or expired session'}); }
}
export function allow(...roles:Role[]){return (req:AuthRequest,res:Response,next:NextFunction)=>{if(!req.user||!roles.includes(req.user.role))return res.status(403).json({error:'You are not authorized for this action'});next();};}
