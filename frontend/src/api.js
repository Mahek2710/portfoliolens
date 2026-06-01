import axios from "axios";

const api = axios.create({
  baseURL: "http://127.0.0.1:8000",
});

// Attach token to every request automatically
api.interceptors.request.use(config => {
  const token = localStorage.getItem("pl_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// If any request gets 401, clear session and redirect to login
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem("pl_token");
      localStorage.removeItem("pl_user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;