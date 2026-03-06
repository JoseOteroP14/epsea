import { Stack } from "expo-router";

export default function ProjectsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "fade", animationDuration: 250 }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
      <Stack.Screen name="producer/[producerId]" />
    </Stack>
  );
}
