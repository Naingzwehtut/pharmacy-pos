const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

function getToken() {
  return localStorage.getItem('token')
}

function qs(params = {}) {
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  )
  const s = new URLSearchParams(clean).toString()
  return s ? `?${s}` : ''
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

  let res
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers })
  } catch {
    throw new Error('Cannot reach the server. Check the internet connection and try again.')
  }
  const data = await res.json().catch(() => ({}))

  if (res.status === 401 && token && !path.startsWith('/auth/login')) {
    // Session expired or account deactivated: back to the login screen
    localStorage.removeItem('token')
    window.dispatchEvent(new Event('auth:expired'))
  }
  if (!res.ok) {
    throw new Error(data.error || data.msg || `Request failed (${res.status})`)
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

const json = (method, data) => ({ method, body: JSON.stringify(data) })

export const api = {
  // auth & users
  login: (username, password) => request('/auth/login', json('POST', { username, password })),
  me: () => request('/auth/me'),
  changePassword: (current_password, new_password) =>
    request('/auth/change-password', json('POST', { current_password, new_password })),
  getUsers: () => request('/users'),
  createUser: (data) => request('/users', json('POST', data)),
  updateUser: (id, data) => request(`/users/${id}`, json('PUT', data)),

  // medicines
  getMedicines: (params = {}) => request(`/medicines${qs(params)}`),
  getMedicine: (id) => request(`/medicines/${id}`),
  findBarcode: (code) => request(`/medicines/barcode/${encodeURIComponent(code)}`),
  getCategories: () => request('/medicines/categories'),
  createMedicine: (data) => request('/medicines', json('POST', data)),
  updateMedicine: (id, data) => request(`/medicines/${id}`, json('PUT', data)),
  deleteMedicine: (id) => request(`/medicines/${id}`, { method: 'DELETE' }),
  updateBatch: (medicineId, batchId, data) =>
    request(`/medicines/${medicineId}/batches/${batchId}`, json('PUT', data)),
  adjustStock: (id, data) => request(`/medicines/${id}/adjust`, json('POST', data)),
  getMovements: (params = {}) => request(`/medicines/movements${qs(params)}`),

  // suppliers & purchases
  getSuppliers: (params = {}) => request(`/suppliers${qs(params)}`),
  createSupplier: (data) => request('/suppliers', json('POST', data)),
  updateSupplier: (id, data) => request(`/suppliers/${id}`, json('PUT', data)),
  deleteSupplier: (id) => request(`/suppliers/${id}`, { method: 'DELETE' }),
  getPurchases: (params = {}) => request(`/purchases${qs(params)}`),
  createPurchase: (data) => request('/purchases', json('POST', data)),

  // sales
  checkout: (payload) => request('/sales/checkout', json('POST', payload)),
  getSales: (params = {}) => request(`/sales${qs(params)}`),
  getSale: (id) => request(`/sales/${id}`),
  voidSale: (id, reason) => request(`/sales/${id}/void`, json('POST', { reason })),
  exportSales: async (params = {}) => requestBlob(`/sales/export.csv${qs(params)}`),

  // credit
  getCreditAccounts: () => request('/credit/accounts'),
  getCreditStatement: (patientId) => request(`/credit/accounts/${patientId}`),
  receiveCreditPayment: (patientId, data) =>
    request(`/credit/accounts/${patientId}/payments`, json('POST', data)),
  deleteCreditPayment: (id) => request(`/credit/payments/${id}`, { method: 'DELETE' }),

  // settings
  getSettings: () => request('/settings'),
  updateSettings: (data) => request('/settings', json('PUT', data)),
  getReceiptSettings: () => request('/settings/receipt'),

  // patients
  getPatients: (params = {}) => request(`/patients${qs(params)}`),
  getPatient: (id) => request(`/patients/${id}`),
  createPatient: (data) => request('/patients', json('POST', data)),
  updatePatient: (id, data) => request(`/patients/${id}`, json('PUT', data)),
  deletePatient: (id) => request(`/patients/${id}`, { method: 'DELETE' }),
  getInvestigations: (patientId) => request(`/patients/${patientId}/investigations`),
  uploadInvestigation: (patientId, formData) =>
    request(`/patients/${patientId}/investigations`, { method: 'POST', body: formData }),
  updateInvestigation: (patientId, invId, data) =>
    request(`/patients/${patientId}/investigations/${invId}`, json('PUT', data)),
  deleteInvestigation: (patientId, invId) =>
    request(`/patients/${patientId}/investigations/${invId}`, { method: 'DELETE' }),
  getInvestigationFile: (patientId, invId) =>
    requestBlob(`/patients/${patientId}/investigations/${invId}/file`),

  // dashboard & reports
  getDashboard: () => request('/dashboard'),
  getCalendarStats: (year, month) => request(`/dashboard/calendar?year=${year}&month=${month}`),
  getDailyReport: (params = {}) => request(`/reports/daily${qs(params)}`),
  getExpiryReport: (days = 90) => request(`/reports/expiry?days=${days}`),
}
