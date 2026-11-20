const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

function getToken() {
  return localStorage.getItem('token')
}

async function request(path, options = {}) {
  const headers = {
    // File uploads (FormData) must let the browser set the multipart boundary
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
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

// Downloads a protected file (with the login token) and returns a Blob
async function requestBlob(path) {
  const token = getToken()
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Request failed (${res.status})`)
  }
  return res.blob()
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
  checkout: (payload) =>
    request('/sales/checkout', { method: 'POST', body: JSON.stringify(payload) }),
  getDeliveryFee: () => request('/settings/delivery-fee'),
  updateDeliveryFee: (delivery_fee) =>
    request('/settings/delivery-fee', {
      method: 'PUT',
      body: JSON.stringify({ delivery_fee }),
    }),
  getReceiptSettings: () => request('/settings/receipt'),
  updateReceiptSettings: (data) =>
    request('/settings/receipt', { method: 'PUT', body: JSON.stringify(data) }),
  getSales: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/sales${qs ? `?${qs}` : ''}`)
  },
  getSale: (id) => request(`/sales/${id}`),
  getDoctorFee: () => request('/settings/doctor-fee'),
  updateDoctorFee: (doctor_fee) =>
    request('/settings/doctor-fee', {
      method: 'PUT',
      body: JSON.stringify({ doctor_fee }),
    }),
  getPatients: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/patients${qs ? `?${qs}` : ''}`)
  },
  getPatient: (id) => request(`/patients/${id}`),
  createPatient: (data) =>
    request('/patients', { method: 'POST', body: JSON.stringify(data) }),
  updatePatient: (id, data) =>
    request(`/patients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePatient: (id) => request(`/patients/${id}`, { method: 'DELETE' }),
  getInvestigations: (patientId) => request(`/patients/${patientId}/investigations`),
  uploadInvestigation: (patientId, formData) =>
    request(`/patients/${patientId}/investigations`, { method: 'POST', body: formData }),
  updateInvestigation: (patientId, invId, data) =>
    request(`/patients/${patientId}/investigations/${invId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteInvestigation: (patientId, invId) =>
    request(`/patients/${patientId}/investigations/${invId}`, { method: 'DELETE' }),
  getInvestigationFile: (patientId, invId) =>
    requestBlob(`/patients/${patientId}/investigations/${invId}/file`),
  getDashboard: () => request('/dashboard'),
  getCalendarStats: (year, month) =>
    request(`/dashboard/calendar?year=${year}&month=${month}`),
}
