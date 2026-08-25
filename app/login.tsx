import React, { useState } from "react";
import { TouchableOpacity, Text } from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import axios from "axios";
import { api } from "../src/lib/api";
import { AuthButton, AuthField, AuthLayout, authStyles } from "../src/components/auth";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Por favor, rellena todos los campos");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const response = await api.post("/auth/login", { email, password });
      await SecureStore.setItemAsync("token", response.data.access_token);
      router.replace("/dashboard");
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || "Credenciales inválidas");
      } else {
        setError("Error de conexión con el servidor");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Task Manager Mobile"
      subtitle="Inicia sesión en tu espacio de trabajo"
      error={error}
    >
      <AuthField
        label="Correo Electrónico"
        value={email}
        onChangeText={setEmail}
        placeholder="usuario@ejemplo.com"
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <AuthField
        label="Contraseña"
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        secureTextEntry
      />
      <AuthButton title="Entrar" loading={loading} onPress={handleLogin} />
      <TouchableOpacity
        onPress={() => router.push("/register")}
        style={authStyles.linkContainer}
      >
        <Text style={authStyles.linkText}>¿No tienes cuenta? Regístrate</Text>
      </TouchableOpacity>
    </AuthLayout>
  );
}
