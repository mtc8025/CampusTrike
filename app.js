/* CampusTrike — enhanced client with glassmorphism UI, page routing, profile, filters & ratings */
const API = window.CAMPUS_TRIKE_API || '/api';
const $ = id => document.getElementById(id);
const money = value => '₦' + Number(value || 0).toLocaleString('en-NG');
const labels = {
  pending: 'Pending driver',
  accepted: 'Accepted',
  driver_arriving: 'Driver arriving',
  in_progress: 'Ride in progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
  expired: 'Expired'
};

let user = null;
let bookings = [];
let locations = [];
let fareSettings = null;
let authMode = 'login';
let currentPage = 'home';
let pollTimer = null;
let ratingBookingId = null;
let selectedRating = 0;
let notifications = [];
let unreadCount = 0;
let notifOpen = false;
let bookingMode = 'quick'; // quick | choose
let availableDrivers = [];

const token = () => sessionStorage.getItem('ct_access_token');

function toast(message) {
  const node = $('toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(node._t);
  node._t = setTimeout(() => node.classList.remove('show'), 3200);
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token()) headers.Authorization = `Bearer ${token()}`;
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({ error: 'Unexpected server response' }));
  if (!response.ok) throw new Error(data.error || data.message || `Request failed (${response.status})`);
  return data;
}

/* ---------- Routing ---------- */

function buildSidebar() {
  const nav = $('sidebarNav');
  if (!nav || !user) return;
  const name = user.fullName || user.full_name || user.email || 'User';
  if ($('sidebarUserName')) $('sidebarUserName').textContent = name;
  const role = user.role;
  if ($('sidebarTitle')) {
    $('sidebarTitle').textContent = role === 'driver' ? 'Driver Hub' : role === 'admin' ? 'Admin Panel' : 'Trike Rides';
  }
  const items = [];
  if (role === 'student') {
    items.push({ page: 'book', icon: '＋', label: 'Book a Ride' });
    items.push({ page: 'trips', icon: '☰', label: 'My Trips' });
  } else if (role === 'driver') {
    items.push({ page: 'trips', icon: '🔔', label: 'New Requests' });
    items.push({ page: 'trips', icon: '☰', label: 'Active Rides' });
  } else {
    items.push({ page: 'trips', icon: '▦', label: 'Overview' });
  }
  items.push({ page: 'profile', icon: '◎', label: 'Profile' });
  items.push({ page: 'settings', icon: '⚙', label: 'Settings' });
  items.push({ page: 'about', icon: 'ℹ', label: 'About' });
  nav.innerHTML = items.map(i =>
    `<a href="#${i.page}" data-page="${i.page}"><span class="nav-icon">${i.icon}</span>${i.label}</a>`
  ).join('');
  nav.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      navigate(a.dataset.page);
    });
  });
  const ot = $('onlineToggleWrap');
  if (ot) {
    ot.hidden = user.role !== 'driver';
    if (user.role === 'driver') updateOnlineButton(!!user.is_online);
  }
}


async function loadAvailableDrivers() {
  try {
    const res = await api('/drivers/available');
    availableDrivers = res.drivers || [];
    const sel = $('preferredDriver');
    if (!sel) return;
    sel.replaceChildren();
    if (!availableDrivers.length) {
      const o = document.createElement('option');
      o.value = '';
      o.textContent = 'No drivers online right now';
      sel.append(o);
      return;
    }
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'Select a driver';
    sel.append(ph);
    availableDrivers.forEach(d => {
      const o = document.createElement('option');
      o.value = d.id;
      const rating = d.avg_rating > 0 ? ` ★${Number(d.avg_rating).toFixed(1)}` : '';
      const plate = d.registration_number ? ` · ${d.registration_number}` : '';
      o.textContent = `${d.full_name}${rating}${plate}`;
      sel.append(o);
    });
  } catch (err) {
    console.warn(err);
  }
}

function setBookingMode(mode) {
  bookingMode = mode;
  const choose = mode === 'choose';
  if ($('chooseDriverFields')) $('chooseDriverFields').hidden = !choose;
  if ($('modeQuick')) {
    $('modeQuick').style.background = choose ? '' : 'var(--green)';
    $('modeQuick').style.color = choose ? '' : '#fff';
    $('modeQuick').style.borderColor = choose ? '' : 'var(--green)';
  }
  if ($('modeChoose')) {
    $('modeChoose').style.background = choose ? 'var(--green)' : '';
    $('modeChoose').style.color = choose ? '#fff' : '';
    $('modeChoose').style.borderColor = choose ? 'var(--green)' : '';
  }
  if (choose) loadAvailableDrivers();
}

function updateOnlineButton(online) {
  const btn = $('onlineToggle');
  if (!btn) return;
  btn.textContent = online ? '● Online — tap to go offline' : '○ Offline — tap to go online';
  btn.style.background = online ? 'var(--green)' : '';
  btn.style.color = online ? '#fff' : '';
  btn.style.borderColor = online ? 'var(--green)' : '';
  if (user) user.is_online = online;
}

function navigate(page) {
  currentPage = page || 'trips';
  document.querySelectorAll('.page').forEach(s => {
    s.classList.toggle('active', s.dataset.page === currentPage);
  });
  document.querySelectorAll('#sidebarNav a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === currentPage);
  });
  const titles = {
    trips: user?.role === 'admin' ? 'Administration' : user?.role === 'driver' ? 'Ride Requests' : 'My Trips',
    book: 'Book a Ride',
    profile: 'Profile',
    settings: 'Settings',
    about: 'About'
  };
  if ($('pageTitle')) $('pageTitle').textContent = titles[currentPage] || 'Dashboard';
  if (location.hash !== `#${currentPage}`) {
    history.replaceState(null, '', `#${currentPage}`);
  }
  if (currentPage === 'trips' && user) refresh();
  if (currentPage === 'profile' && user) renderProfile();
  // close mobile sidebar
  $('sidebar')?.classList.remove('open');
  $('sidebarOverlay')?.classList.remove('show');
}

function initRouting() {
  window.addEventListener('hashchange', () => {
    if (!user) return;
    const p = (location.hash || '#trips').replace('#', '') || 'trips';
    navigate(p);
  });
}

/* ---------- Auth ---------- */

function showRideConfirm(booking, statusOverride) {
  const modal = $('confirmModal');
  if (!modal) return;
  const status = statusOverride || booking.status;
  if ($('confirmTitle')) $('confirmTitle').textContent =
    status === 'accepted' ? 'Ride accepted' :
    status === 'completed' ? 'Trip completed' : 'Ride details';
  if ($('confirmStatus')) $('confirmStatus').textContent = statusText(status);
  if ($('confirmDriver')) $('confirmDriver').textContent =
    booking.driver_name || (user?.role === 'driver' ? (user.fullName || 'You') : 'Assigned driver');
  if ($('confirmPickup')) $('confirmPickup').textContent =
    booking.pickup_name || booking.pickup || '—';
  if ($('confirmDest')) $('confirmDest').textContent =
    booking.destination_name || booking.destination || '—';
  if ($('confirmRef')) $('confirmRef').textContent = booking.reference || booking.id?.slice(0, 8) || '—';
  if ($('confirmFare')) $('confirmFare').textContent = money(booking.final_fare ?? booking.estimated_fare);
  if ($('confirmNote')) {
    $('confirmNote').textContent = booking.scheduled_at
      ? 'Scheduled: ' + new Date(booking.scheduled_at).toLocaleString()
      : 'Cash payment to driver on completion.';
  }
  modal.hidden = false;
}

function hideRideConfirm() {
  if ($('confirmModal')) $('confirmModal').hidden = true;
}

function showRegisterPage(mode) {
  $('registerPage').hidden = false;
  // hide hero/about while on auth page
  const hero = document.querySelector('#publicView .hero');
  const about = $('aboutPublic');
  if (hero) hero.style.display = 'none';
  if (about) about.style.display = 'none';
  setAuthModePage(mode || 'login');
}

function hideRegisterPage() {
  if ($('registerPage')) $('registerPage').hidden = true;
  const hero = document.querySelector('#publicView .hero');
  const about = $('aboutPublic');
  if (hero) hero.style.display = '';
  if (about) about.style.display = '';
}

function setAuthModePage(mode) {
  authMode = mode;
  const signup = mode === 'register';
  if ($('regTitle')) $('regTitle').textContent = signup ? 'Create account' : 'Welcome back';
  if ($('regDesc')) $('regDesc').textContent = signup
    ? 'Register as a student or driver.'
    : 'Sign in to manage your campus rides.';
  if ($('nameFieldPage')) $('nameFieldPage').hidden = !signup;
  if ($('roleFieldPage')) $('roleFieldPage').hidden = !signup;
  if ($('authNamePage')) $('authNamePage').required = signup;
  if ($('authSubmitPage')) $('authSubmitPage').textContent = signup ? 'Register →' : 'Sign in →';
  document.querySelectorAll('.auth-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.authMode === mode);
  });
}

function showAuth(show) {
  const gate = $('authGate');
  if (gate) gate.hidden = !show;
}

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === 'register';
  $('authTitle').textContent = signup ? 'Create account' : 'Welcome back';
  $('authDescription').textContent = signup
    ? 'Register as a student or driver to use CampusTrike.'
    : 'Sign in to manage your campus rides.';
  $('nameField').hidden = !signup;
  $('roleField').hidden = !signup;
  $('authName').required = signup;
  $('authSubmit').innerHTML = signup ? 'Create account <span>→</span>' : 'Sign in <span>→</span>';
  $('authSwitchText').textContent = signup ? 'Already have an account?' : 'New to CampusTrike?';
  $('authSwitch').textContent = signup ? 'Sign in' : 'Create account';
}

async function enterApp() {
  const me = await api('/me');
  user = me.user || me;
  if (user.full_name && !user.fullName) user.fullName = user.full_name;
  showAuth(false);
  $('publicView').style.display = 'none';
  $('appShell').classList.add('visible');
  buildSidebar();
  await loadLocationsAndFares();
  await refresh();
  renderWorkspace();
  if (user.role === 'admin') await loadAdmin();
  startPolling();
  renderProfile();
  loadNotifications();
  if (user.role === 'admin') loadAdminStats();
  navigate(currentPage === 'home' ? 'trips' : currentPage);
}

function logout() {
  sessionStorage.removeItem('ct_access_token');
  user = null;
  bookings = [];
  stopPolling();
  $('adminPanels').hidden = true;
  $('vehicleSection').hidden = true;
  if ($('notifPanel')) $('notifPanel').hidden = true;
  notifOpen = false;
  notifications = [];
  unreadCount = 0;
  $('appShell').classList.remove('visible');
  $('publicView').style.display = '';
  showAuth(false);
  setAuthMode('login');
  currentPage = 'home';
  history.replaceState(null, '', '#home');
}

/* ---------- Data loading ---------- */
async function loadLocationsAndFares() {
  try {
    const locRes = await api('/locations');
    locations = locRes.locations || locRes || [];
    populateLocations();
  } catch (err) {
    console.warn('Locations load failed', err);
  }
  try {
    const fareRes = await api('/fares');
    fareSettings = fareRes.fare || fareRes || { base_fare: 300, per_zone_fare: 50 };
    updateFarePreview();
  } catch (err) {
    fareSettings = { base_fare: 300, per_zone_fare: 50 };
    updateFarePreview();
  }
}

function populateLocations() {
  for (const id of ['pickup', 'destination']) {
    const select = $(id);
    if (!select) continue;
    const old = select.value;
    select.replaceChildren();
    locations.filter(l => l.active !== false).forEach(loc => {
      const option = document.createElement('option');
      option.value = loc.id;
      option.textContent = loc.name + (loc.zone ? ` (${loc.zone})` : '');
      select.append(option);
    });
    if ([...select.options].some(o => o.value === old)) select.value = old;
    else if (select.options.length) {
      select.selectedIndex = id === 'pickup' ? 0 : Math.min(1, select.options.length - 1);
    }
  }
  updateFarePreview();
  updateHeroSummary();
}

function updateFarePreview() {
  const base = Number(fareSettings?.base_fare || 300);
  const perZone = Number(fareSettings?.per_zone_fare || 0);
  // Simple zone difference estimate
  let estimate = base;
  const p = locations.find(l => l.id === $('pickup')?.value);
  const d = locations.find(l => l.id === $('destination')?.value);
  if (p && d && p.zone && d.zone && p.zone !== d.zone) {
    estimate = base + perZone;
  }
  const el = $('formFare');
  if (el) el.textContent = money(estimate);
  const sum = $('summaryFare');
  if (sum) sum.textContent = money(estimate);
  const hint = $('fareHint');
  if (hint) hint.textContent = p && d && p.zone !== d.zone ? 'Base + zone' : 'Base fare';
}

function updateHeroSummary() {
  const p = locations.find(l => l.id === $('pickup')?.value);
  const d = locations.find(l => l.id === $('destination')?.value);
  if ($('summaryPickup') && p) $('summaryPickup').textContent = p.name;
  if ($('summaryDestination') && d) $('summaryDestination').textContent = d.name;
  if ($('mapPickupLabel') && p) $('mapPickupLabel').textContent = p.name;
  if ($('mapDestLabel') && d) $('mapDestLabel').textContent = d.name;
}

function statusText(status) {
  return labels[status] || String(status || '').replaceAll('_', ' ');
}

/* ---------- Bookings UI ---------- */
function createTripCard(booking) {
  const card = document.createElement('article');
  card.className = 'request-card';

  const left = document.createElement('div');
  const title = document.createElement('h3');
  const pickupName = booking.pickup_name || booking.pickup?.name || 'Pickup';
  const destName = booking.destination_name || booking.destination?.name || 'Destination';
  title.textContent = `${pickupName} → ${destName}`;
  left.append(title);

  const ref = document.createElement('p');
  ref.textContent = `Reference: ${booking.reference || booking.id?.slice(0, 8)}`;
  left.append(ref);

  const date = document.createElement('p');
  date.textContent = new Date(booking.created_at).toLocaleString();
  left.append(date);

  if (booking.note) {
    const note = document.createElement('p');
    note.textContent = `Note: ${booking.note}`;
    left.append(note);
  }
  if (booking.scheduled_at) {
    const sch = document.createElement('p');
    sch.textContent = `Scheduled: ${new Date(booking.scheduled_at).toLocaleString()}`;
    left.append(sch);
  }

  if (booking.rating) {
    const r = document.createElement('p');
    r.textContent = `Rated: ${'★'.repeat(booking.rating)}${'☆'.repeat(5 - booking.rating)}`;
    left.append(r);
  }

  const actions = document.createElement('div');
  actions.className = 'request-actions';

  const addAction = (text, fn, danger = false) => {
    const b = document.createElement('button');
    if (text === 'Accept' || text === 'Accept Ride') b.className = 'btn-accept';
    else if (text === 'Decline') b.className = 'btn-decline';
    else if (danger) b.className = 'btn-danger';
    else b.className = 'btn-secondary';
    b.type = 'button';
    b.textContent = text;
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await fn();
        await refresh();
      } catch (err) {
        toast(err.message);
        b.disabled = false;
      }
    });
    actions.append(b);
  };

  if (user) {
    if (user.role === 'driver' && booking.status === 'pending') {
      addAction('Decline', async () => {
        await api(`/bookings/${booking.id}/decline`, { method: 'PATCH' });
        toast('Request declined');
      }, true);
      addAction('Accept Ride', async () => {
        const res = await api(`/bookings/${booking.id}/accept`, { method: 'PATCH' });
        showRideConfirm(res.booking || booking, 'accepted');
      });
    }
    if (user.role === 'driver' && booking.driver_id === user.id) {
      if (booking.status === 'accepted') {
        addAction('Driver arriving', () =>
          api(`/bookings/${booking.id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'driver_arriving' })
          })
        );
      }
      if (booking.status === 'driver_arriving') {
        addAction('Start trip', () =>
          api(`/bookings/${booking.id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'in_progress' })
          })
        );
      }
      if (booking.status === 'in_progress') {
        addAction('Complete', () =>
          api(`/bookings/${booking.id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'completed' })
          })
        );
      }
      if (['accepted', 'driver_arriving', 'in_progress'].includes(booking.status)) {
        addAction('Report cash', () =>
          api(`/bookings/${booking.id}/payment`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'reported' })
          })
        );
      }
    }
    if (user.role === 'student' && booking.status === 'pending') {
      addAction('Cancel', () => api(`/bookings/${booking.id}/cancel`, { method: 'PATCH' }), true);
    }
    if (user.role === 'student' && booking.status === 'completed' && !booking.rating) {
      addAction('Rate trip', () => openRating(booking.id));
    }
    if (user.role === 'admin' && booking.payment_status === 'reported') {
      addAction('Confirm payment', () =>
        api(`/bookings/${booking.id}/payment`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'confirmed' })
        })
      );
    }
  }

  left.append(actions);

  const right = document.createElement('div');
  right.className = 'trip-meta';
  const amount = document.createElement('strong');
  amount.textContent = money(booking.final_fare ?? booking.estimated_fare);
  right.append(amount);
  const status = document.createElement('span');
  status.className = 'status-pill';
  status.textContent = statusText(booking.status);
  right.append(status);

  card.append(left, right);
  return card;
}

function getFilteredBookings() {
  let list = [...bookings];
  const status = $('statusFilter')?.value;
  const q = ($('tripSearch')?.value || '').trim().toLowerCase();
  if (status) list = list.filter(b => b.status === status);
  if (q) {
    list = list.filter(b =>
      (b.reference || '').toLowerCase().includes(q) ||
      (b.pickup_name || '').toLowerCase().includes(q) ||
      (b.destination_name || '').toLowerCase().includes(q)
    );
  }
  return list;
}

function renderBookings() {
  const list = $('tripsList');
  if (!list) return;
  list.replaceChildren();
  const filtered = getFilteredBookings();
  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = user
      ? '<strong>No matching trips</strong>Try another filter or book a new ride.'
      : '<strong>No trips yet</strong>Sign in and book your first campus ride.';
    list.append(empty);
  } else {
    filtered.forEach(b => list.append(createTripCard(b)));
  }

  // Stats
  const active = bookings.filter(b =>
    ['pending', 'accepted', 'driver_arriving', 'in_progress'].includes(b.status)
  ).length;
  const completed = bookings.filter(b => b.status === 'completed').length;
  const fares = bookings
    .filter(b => b.status === 'completed')
    .reduce((sum, b) => sum + Number(b.final_fare ?? b.estimated_fare ?? 0), 0);

  if ($('statTotal')) $('statTotal').textContent = bookings.length;
  if ($('statActive')) $('statActive').textContent = active;
  if ($('statCompleted')) $('statCompleted').textContent = completed;
  if ($('statFares')) $('statFares').textContent = money(fares);
}

async function refresh() {
  if (!token()) return;
  try {
    const result = await api('/bookings');
    bookings = result.bookings || [];
    // Enrich with location names if missing
    bookings.forEach(b => {
      if (!b.pickup_name) {
        const p = locations.find(l => l.id === b.pickup_id);
        if (p) b.pickup_name = p.name;
      }
      if (!b.destination_name) {
        const d = locations.find(l => l.id === b.destination_id);
        if (d) b.destination_name = d.name;
      }
    });
    renderBookings();
    renderWorkspace();
  } catch (err) {
    toast(err.message);
  }
}

function renderWorkspace() {
  if (!user) return;
  const role = user.role;
  const title =
    role === 'admin' ? 'Administration workspace' :
    role === 'driver' ? 'Driver workspace' : 'Student workspace';
  if ($('workspaceRole')) $('workspaceRole').textContent = role.toUpperCase();
  if ($('workspaceHeading')) $('workspaceHeading').textContent = title;
  if ($('workspaceBadge')) {
    $('workspaceBadge').textContent =
      role === 'admin' ? 'Admin controls' :
      role === 'driver' ? 'Accept & manage rides' : 'Book & track rides';
  }
  if ($('adminPanels')) $('adminPanels').hidden = role !== 'admin';
  if ($('vehicleSection')) $('vehicleSection').hidden = role !== 'driver';
}

/* ---------- Admin ---------- */

async function loadAdminStats() {
  if (!user || user.role !== 'admin') return;
  try {
    const res = await api('/admin/stats');
    const b = res.bookings || {};
    if ($('statPending')) $('statPending').textContent = b.pending || 0;
    if ($('statRevenue')) $('statRevenue').textContent = money(b.revenue || 0);
    const r = res.ratings || {};
    if ($('statAvgRating')) {
      const avg = Number(r.avg_rating || 0);
      $('statAvgRating').textContent = avg > 0 ? avg.toFixed(1) + ' ★' : '—';
    }
    if ($('statRated')) $('statRated').textContent = r.rated_trips || 0;

    const list = $('activityList');
    if (list) {
      list.replaceChildren();
      const recent = res.recent || [];
      if (!recent.length) {
        list.innerHTML = '<li class="fine-print">No recent bookings</li>';
      } else {
        recent.forEach(row => {
          const li = document.createElement('li');
          const left = document.createElement('div');
          left.innerHTML = `<strong>${escapeHtml(row.pickup || '')} → ${escapeHtml(row.destination || '')}</strong>
            <div style="font-size:12px;color:var(--muted)">${escapeHtml(row.student_name || '')}${row.driver_name ? ' · ' + escapeHtml(row.driver_name) : ''} · ${statusText(row.status)}</div>`;
          const meta = document.createElement('div');
          meta.className = 'activity-meta';
          let stars = '';
          if (row.rating) stars = `<div class="rating-stars">${'★'.repeat(row.rating)}</div>`;
          meta.innerHTML = `${money(row.estimated_fare)}<br>${new Date(row.created_at).toLocaleDateString()}${stars}`;
          li.append(left, meta);
          list.append(li);
        });
      }
    }
  } catch (err) {
    console.warn('admin stats', err);
  }
}

async function loadAdmin() {
  await loadAdminStats();
  try {
    const ov = await api('/admin/overview');
    // overview already reflected in stats via bookings
    const dr = await api('/admin/drivers');
    const box = $('driverApprovals');
    if (!box) return;
    box.replaceChildren();
    const drivers = dr.drivers || [];
    if (!drivers.length) {
      box.innerHTML = '<p class="fine-print">No driver accounts yet.</p>';
      return;
    }
    drivers.forEach(d => {
      const row = document.createElement('div');
      row.className = 'driver-row';
      const info = document.createElement('div');
      info.innerHTML = `<strong>${d.full_name || d.fullName}</strong><br><span style="font-size:12px;color:var(--muted)">${dd.email} · ${d.status}</span>`;
      const acts = document.createElement('div');
      acts.className = 'driver-actions';
      if (d.status === 'pending') {
        ['active', 'rejected'].forEach(st => {
          const b = document.createElement('button');
          b.className = st === 'active' ? 'secondary-btn' : 'danger-btn';
          b.textContent = st === 'active' ? 'Approve' : 'Reject';
          b.type = 'button';
          b.addEventListener('click', async () => {
            try {
              await api(`/admin/drivers/${d.id}/approval`, {
                method: 'PATCH',
                body: JSON.stringify({ status: st })
              });
              toast(st === 'active' ? 'Driver approved' : 'Driver rejected');
              await loadAdmin();
            } catch (err) {
              toast(err.message);
            }
          });
          acts.append(b);
        });
      }
      row.append(info, acts);
      box.append(row);
    });
  } catch (err) {
    console.warn(err);
  }
}

/* ---------- Profile ---------- */
function renderProfile() {
  if (!user) return;
  const name = user.fullName || user.full_name || 'User';
  const initials = name.split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();
  if ($('profileAvatar')) $('profileAvatar').textContent = initials || '?';
  if ($('profileName')) $('profileName').textContent = name;
  if ($('profileEmail')) $('profileEmail').textContent = user.email || '—';
  if ($('profileRole')) $('profileRole').textContent = (user.role || '—').toUpperCase();
  if ($('infoName')) $('infoName').textContent = name;
  if ($('infoEmail')) $('infoEmail').textContent = user.email || '—';
  if ($('infoRole')) $('infoRole').textContent = user.role || '—';
  if ($('infoStatus')) $('infoStatus').textContent = user.status || 'active';
  if ($('infoJoined')) {
    $('infoJoined').textContent = user.created_at
      ? new Date(user.created_at).toLocaleDateString()
      : '—';
  }
  if ($('editName')) $('editName').value = name;
}

/* ---------- Rating ---------- */
function openRating(bookingId) {
  ratingBookingId = bookingId;
  selectedRating = 0;
  document.querySelectorAll('#ratingStars .star').forEach(s => s.classList.remove('active'));
  if ($('ratingComment')) $('ratingComment').value = '';
  $('ratingModal').hidden = false;
}

function closeRating() {
  $('ratingModal').hidden = true;
  ratingBookingId = null;
  selectedRating = 0;
}


/* ---------- Notifications ---------- */
async function loadNotifications() {
  if (!token()) return;
  try {
    const res = await api('/notifications');
    notifications = res.notifications || [];
    unreadCount = res.unread || 0;
    renderNotifications();
  } catch (err) {
    console.warn('notifications', err);
  }
}

function renderNotifications() {
  const badge = $('notifBadge');
  const list = $('notifList');
  const wrap = $('notifWrap');
  if (wrap) wrap.hidden = !user;
  if (badge) {
    if (unreadCount > 0) {
      badge.hidden = false;
      badge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
    } else {
      badge.hidden = true;
    }
  }
  if (!list) return;
  list.replaceChildren();
  if (!notifications.length) {
    list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
    return;
  }
  notifications.forEach(n => {
    const item = document.createElement('div');
    item.className = 'notif-item' + (n.read ? '' : ' unread');
    item.innerHTML = `<strong>${escapeHtml(n.title)}</strong>
      <p>${escapeHtml(n.body || '')}</p>
      <time>${new Date(n.created_at).toLocaleString()}</time>`;
    item.addEventListener('click', async () => {
      if (!n.read) {
        try {
          await api('/notifications/read', { method: 'PATCH', body: JSON.stringify({ ids: [n.id] }) });
          n.read = true;
          unreadCount = Math.max(0, unreadCount - 1);
          renderNotifications();
        } catch {}
      }
    });
    list.append(item);
  });
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function toggleNotifPanel() {
  notifOpen = !notifOpen;
  const panel = $('notifPanel');
  if (panel) panel.hidden = !notifOpen;
  if (notifOpen) loadNotifications();
}

/* ---------- Polling ---------- */
function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (user && (currentPage === 'trips' || currentPage === 'book')) {
      refresh().catch(() => {});
    }
    if (user) loadNotifications().catch(() => {});
  }, 25000);
}
function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

/* ---------- Theme ---------- */
function initTheme() {
  if (localStorage.getItem('ct_dark') === '1') document.body.classList.add('dark');
  $('themeBtn')?.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('ct_dark', document.body.classList.contains('dark') ? '1' : '0');
    $('themeBtn').textContent = document.body.classList.contains('dark') ? '☾' : '☼';
  });
  if (document.body.classList.contains('dark')) $('themeBtn').textContent = '☾';
}

/* ---------- Event wiring ---------- */
function wireEvents() {
  $('authSwitch')?.addEventListener('click', () =>
    setAuthMode(authMode === 'login' ? 'register' : 'login')
  );

  $('authForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      email: $('authEmail').value.trim().toLowerCase(),
      password: $('authPassword').value
    };
    try {
      if (authMode === 'register') {
        payload.fullName = $('authName').value.trim();
        payload.role = $('authRole').value;
        const result = await api('/auth/register', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        toast(result.message || 'Account created. Please sign in.');
        setAuthMode('login');
      } else {
        const result = await api('/auth/login', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        sessionStorage.setItem('ct_access_token', result.token);
        await enterApp();
        toast('Signed in successfully');
        navigate('trips');
      }
    } catch (err) {
      toast(err.message);
    }
  });

  

  $('bookingForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!user) {
      showAuth(true);
      toast('Please sign in to book a ride');
      return;
    }
    if (user.role !== 'student') {
      toast('Only students can request rides');
      return;
    }
    const pickup = $('pickup').value;
    const destination = $('destination').value;
    if (pickup === destination) {
      toast('Pickup and destination must be different');
      return;
    }
    const note = $('note').value.trim();
    const payload = { pickupId: pickup, destinationId: destination, note };
    if (bookingMode === 'choose') {
      const driverId = $('preferredDriver')?.value;
      if (!driverId) {
        toast('Please select an available driver');
        return;
      }
      payload.preferredDriverId = driverId;
      const date = $('rideDate')?.value;
      const time = $('rideTime')?.value;
      if (date && time) {
        payload.scheduledAt = new Date(date + 'T' + time + ':00').toISOString();
      } else if (date || time) {
        toast('Please set both date and time, or leave both empty for ASAP');
        return;
      }
    }
    try {
      $('bookSubmit').disabled = true;
      await api('/bookings', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      toast('Ride requested successfully');
      $('note').value = '';
      await refresh();
      navigate('trips');
    } catch (err) {
      toast(err.message);
    } finally {
      $('bookSubmit').disabled = false;
    }
  });

  $('pickup')?.addEventListener('change', () => {
    updateFarePreview();
    updateHeroSummary();
  });
  $('destination')?.addEventListener('change', () => {
    updateFarePreview();
    updateHeroSummary();
  });

  $('statusFilter')?.addEventListener('change', renderBookings);
  $('tripSearch')?.addEventListener('input', renderBookings);
  $('refreshBtn')?.addEventListener('click', () => refresh().then(() => toast('Refreshed')));

  $('saveFare')?.addEventListener('click', async () => {
    try {
      const baseFare = Number($('baseFare').value);
      const perZoneFare = Number($('perZoneFare')?.value || 0);
      await api('/admin/fares', {
        method: 'PATCH',
        body: JSON.stringify({ baseFare, perZoneFare })
      });
      fareSettings = { base_fare: baseFare, per_zone_fare: perZoneFare };
      updateFarePreview();
      toast('Fare settings saved');
    } catch (err) {
      toast(err.message);
    }
  });

  $('saveNameBtn')?.addEventListener('click', async () => {
    const name = $('editName').value.trim();
    if (name.length < 2) {
      toast('Name is too short');
      return;
    }
    try {
      const result = await api('/me', {
        method: 'PATCH',
        body: JSON.stringify({ fullName: name })
      });
      const u = result.user;
      user.fullName = u.full_name || name;
      user.full_name = user.fullName;
      renderProfile();
      
      toast('Display name updated');
    } catch (err) {
      if (user) {
        user.fullName = name;
        user.full_name = name;
        renderProfile();
        
      }
      toast(err.message || 'Updated locally');
    }
  });

  $('saveVehicleBtn')?.addEventListener('click', async () => {
    const reg = $('vehReg').value.trim();
    if (!reg) {
      toast('Registration number is required');
      return;
    }
    try {
      const result = await api('/vehicles', {
        method: 'POST',
        body: JSON.stringify({
          registrationNumber: reg,
          make: $('vehMake').value.trim() || undefined,
          colour: $('vehColour').value.trim() || undefined,
          capacity: Number($('vehCapacity').value)
        })
      });
      const v = result.vehicle;
      $('vehicleStatus').textContent = `Registered: ${v.registration_number} · ${v.approved ? 'Approved' : 'Pending admin approval'}`;
      toast('Vehicle details saved');
    } catch (err) {
      // Fallback local
      const vehicle = {
        registration_number: reg,
        make: $('vehMake').value.trim(),
        colour: $('vehColour').value.trim(),
        capacity: Number($('vehCapacity').value)
      };
      localStorage.setItem('ct_vehicle_' + (user?.id || 'x'), JSON.stringify(vehicle));
      $('vehicleStatus').textContent = `Saved locally: ${reg} · Backend may be offline`;
      toast(err.message || 'Saved locally');
    }
  });

  // Rating stars
  document.querySelectorAll('#ratingStars .star').forEach(star => {
    star.addEventListener('click', () => {
      selectedRating = Number(star.dataset.v);
      document.querySelectorAll('#ratingStars .star').forEach(s => {
        s.classList.toggle('active', Number(s.dataset.v) <= selectedRating);
      });
    });
  });

  $('submitRating')?.addEventListener('click', async () => {
    if (!selectedRating || !ratingBookingId) {
      toast('Please select a rating');
      return;
    }
    // Try to send rating; if backend lacks endpoint, store locally
    try {
      await api(`/bookings/${ratingBookingId}/rating`, {
        method: 'PATCH',
        body: JSON.stringify({
          rating: selectedRating,
          comment: $('ratingComment').value.trim()
        })
      });
      toast('Thank you for your rating!');
    } catch {
      // Fallback: mark locally
      const b = bookings.find(x => x.id === ratingBookingId);
      if (b) {
        b.rating = selectedRating;
        b.rating_comment = $('ratingComment').value.trim();
      }
      toast('Rating saved locally (backend rating endpoint pending)');
    }
    closeRating();
    renderBookings();
  });

  $('skipRating')?.addEventListener('click', closeRating);

  // Public / shell UI
  $('openAuthBtn')?.addEventListener('click', () => showRegisterPage('login'));
  $('heroBookBtn')?.addEventListener('click', () => showRegisterPage('login'));
  $('heroDriverBtn')?.addEventListener('click', () => {
    showRegisterPage('register');
    if ($('authRolePage')) $('authRolePage').value = 'driver';
  });
  $('backFromAuth')?.addEventListener('click', hideRegisterPage);
  $('tabLogin')?.addEventListener('click', () => setAuthModePage('login'));
  $('tabRegister')?.addEventListener('click', () => setAuthModePage('register'));
  $('closeConfirm')?.addEventListener('click', hideRideConfirm);
  $('confirmOk')?.addEventListener('click', hideRideConfirm);

  $('authFormPage')?.addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      email: $('authEmailPage').value.trim().toLowerCase(),
      password: $('authPasswordPage').value
    };
    try {
      if (authMode === 'register') {
        payload.fullName = $('authNamePage').value.trim();
        payload.role = $('authRolePage').value;
        const result = await api('/auth/register', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        toast(result.message || 'Account created. Please sign in.');
        setAuthModePage('login');
      } else {
        const result = await api('/auth/login', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        sessionStorage.setItem('ct_access_token', result.token);
        hideRegisterPage();
        await enterApp();
        toast('Signed in successfully');
        navigate('trips');
      }
    } catch (err) {
      toast(err.message);
    }
  });
  $('sidebarLogout')?.addEventListener('click', logout);
  $('menuToggle')?.addEventListener('click', () => {
    $('sidebar')?.classList.toggle('open');
    $('sidebarOverlay')?.classList.toggle('show');
  });
  $('sidebarOverlay')?.addEventListener('click', () => {
    $('sidebar')?.classList.remove('open');
    $('sidebarOverlay')?.classList.remove('show');
  });


  // Notifications
  $('notifBtn')?.addEventListener('click', e => {
    e.stopPropagation();
    toggleNotifPanel();
  });
  $('markAllRead')?.addEventListener('click', async () => {
    try {
      await api('/notifications/read', { method: 'PATCH', body: JSON.stringify({ all: true }) });
      notifications.forEach(n => n.read = true);
      unreadCount = 0;
      renderNotifications();
      toast('All marked as read');
    } catch (err) {
      toast(err.message);
    }
  });
  document.addEventListener('click', e => {
    if (notifOpen && $('notifPanel') && !$('notifWrap')?.contains(e.target)) {
      notifOpen = false;
      $('notifPanel').hidden = true;
    }
  });

  // Password change
  $('passwordForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const current = $('currentPassword').value;
    const neu = $('newPassword').value;
    const confirm = $('confirmPassword').value;
    if (neu !== confirm) {
      toast('New passwords do not match');
      return;
    }
    if (neu.length < 10) {
      toast('New password must be at least 10 characters');
      return;
    }
    try {
      $('changePwBtn').disabled = true;
      await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: neu })
      });
      toast('Password updated successfully');
      $('passwordForm').reset();
    } catch (err) {
      toast(err.message);
    } finally {
      $('changePwBtn').disabled = false;
    }
  });

  $('logoutBtnSettings')?.addEventListener('click', logout);
  $('modeQuick')?.addEventListener('click', () => setBookingMode('quick'));
  $('modeChoose')?.addEventListener('click', () => setBookingMode('choose'));
  $('onlineToggle')?.addEventListener('click', async () => {
    if (!user || user.role !== 'driver') return;
    const next = !user.is_online;
    try {
      const res = await api('/me/online', { method: 'PATCH', body: JSON.stringify({ online: next }) });
      updateOnlineButton(!!res.online);
      toast(res.online ? 'You are now online' : 'You are offline');
    } catch (err) {
      toast(err.message);
    }
  });


}

/* ---------- Boot ---------- */
(async () => {
  initRouting();
  wireEvents();
  setAuthMode('login');
  showAuth(false);

  if (token()) {
    try {
      await enterApp();
    } catch (err) {
      sessionStorage.removeItem('ct_access_token');
      toast(err.message);
      $('publicView').style.display = '';
      $('appShell')?.classList.remove('visible');
    }
  }

  try {
    const locRes = await api('/locations');
    locations = locRes.locations || locRes || [];
    if (locations.length) populateLocations();
  } catch {}
})();
