export const APP_NAME = 'Zwe Pharmacy'
export const APP_NAME_MM = 'ဇွဲ ဆေးဆိုင်'

/** Green pharmacy cross with the Zwe Pharmacy wordmark. */
export default function Logo({ sub }) {
  return (
    <div className="logo">
      <svg className="logo-cross" viewBox="0 0 26 26" aria-hidden="true">
        <rect width="26" height="26" rx="5" fill="#1f6b43" />
        <path d="M10 5h6v5h5v6h-5v5h-6v-5H5v-6h5z" fill="#fff" />
      </svg>
      <div className="logo-text">
        <div className="logo-name">{APP_NAME}</div>
        {sub && <div className="logo-sub">{sub}</div>}
      </div>
    </div>
  )
}
