import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

// SW bản mới vừa nắm quyền (deploy mới) -> nạp lại để HTML/JS không lệch bản.
// Chỉ gắn khi trang ĐANG được một SW điều khiển, tránh reload thừa ở lần cài SW đầu tiên.
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload())
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
