const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

function getToken() {
  return localStorage.getItem('token')
}

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }
  const token = getToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers })
  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`)
  }
  return data
}

export const api = {
  login: (username, password) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  me: () => request('/auth/me'),
  getMedicines: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/medicines${qs ? `?${qs}` : ''}`)
  },
  getCategories: () => request('/medicines/categories'),
  createMedicine: (data) =>
    request('/medicines', { method: 'POST', body: JSON.stringify(data) }),
  updateMedicine: (id, data) =>
    request(`/medicines/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMedicine: (id) =>
    request(`/medicines/${id}`, { method: 'DELETE' }),
  checkout: (items) =>
    request('/sales/checkout', { method: 'POST', body: JSON.stringify({ items }) }),
  getSales: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/sales${qs ? `?${qs}` : ''}`)
  },
  getSale: (id) => request(`/sales/${id}`),
  getDashboard: () => request('/dashboard'),
}
