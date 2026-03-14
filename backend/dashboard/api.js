const API = {
  token: () => localStorage.getItem('token'),

  fetch(url, opts = {}) {
    return fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token()}`,
        ...(opts.headers || {})
      }
    }).then(async res => {
      if (res.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/admin';
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      return data;
    });
  },

  get(url)         { return this.fetch(url); },
  post(url, body)  { return this.fetch(url, { method: 'POST',  body: JSON.stringify(body) }); },
  put(url, body)   { return this.fetch(url, { method: 'PUT',   body: JSON.stringify(body) }); },
  patch(url, body) { return this.fetch(url, { method: 'PATCH', body: JSON.stringify(body) }); },
  del(url)         { return this.fetch(url, { method: 'DELETE' }); },

  async login(email, password) {
    const data = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    }).then(r => r.json());
    if (data.token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
    }
    return data;
  },

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/admin';
  },

  currentUser() {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u) : null;
  },

  requireRole(...roles) {
    const user = this.currentUser();
    if (!user || !this.token()) {
      window.location.href = '/admin';
      return false;
    }
    if (roles.length && !roles.includes(user.role)) {
      window.location.href = '/admin';
      return false;
    }
    return true;
  }
};
