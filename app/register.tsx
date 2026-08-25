import React, { useState } from "react";
import { TouchableOpacity, Text } from "react-native";
import { useRouter } from "expo-router";
import axios from "axios";
import { api } from "../src/lib/api";
import { AuthButton, AuthField, AuthLayout, authStyles } from "../src/components/auth";

export default function RegisterScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name || !email || !password) {
      setError("Por favor, completa todos los campos");
      return;
    }

    setError("");
    setLoading(true);

    try {
      await api.post("/auth/register", { name, email, password });
      router.replace("/login");
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || "Error al crear la cuenta");
      } else {
        setError("Error de conexión");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Crear Cuenta"
      subtitle="Únete para gestionar tus tareas"
      error={error}
    >
      <AuthField
        label="Nombre Completo"
        value={name}
        onChangeText={setName}
        placeholder="Tu Nombre"
      />
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
      <AuthButton
        title="Registrarse"
        loading={loading}
        onPress={handleRegister}
      />
      <TouchableOpacity onPress={() => router.back()} style={authStyles.linkContainer}>
        <Text style={authStyles.linkText}>¿Ya tienes cuenta? Inicia sesión</Text>
      </TouchableOpacity>
    </AuthLayout>
  );
}
