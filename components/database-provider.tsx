import { initDatabase } from "@/utils/database/client";
import { useAuthStore } from "@/store/useAuthStore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      try {
        await initDatabase();
        await useAuthStore.getState().hydrate();
      } catch (error) {
        console.error("Bootstrap failed:", error);
      } finally {
        setReady(true);
      }
    }
    bootstrap();
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#1a7a3a" />
      </View>
    );
  }

  return <>{children}</>;
}
