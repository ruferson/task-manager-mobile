import axios from "axios";
import * as SecureStore from "expo-secure-store";

const DEV_API_URL = 'http://localhost:3001';

export const api = axios.create({
  baseURL: DEV_API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(async (config) => {
  try {
    const token = await SecureStore.getItemAsync("token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (error) {
    console.error("Error al leer token:", error);
  }
  return config;
});
