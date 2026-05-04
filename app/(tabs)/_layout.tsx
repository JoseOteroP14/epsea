import { useAlert } from "@/components/ui/custom-alert";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuthStore } from "@/store/useAuthStore";
import { useSyncStore } from "@/store/useSyncStore";
import { responsiveFont, widthScale } from "@/utils/responsive";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Tabs, useRouter } from "expo-router";
import { Briefcase, Home, LogOut, RefreshCw } from "lucide-react-native";
import { useEffect } from "react";
import {
    Dimensions,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const TAB_BAR_MARGIN = 16;
const TAB_BAR_WIDTH = SCREEN_WIDTH - TAB_BAR_MARGIN * 2;

// Nombres de los tabs para los headers
const TAB_TITLES: Record<string, string> = {
  index: "Inicio",
  projects: "Proyectos",
  sync: "Sincronizar",
};

function TabBarIcon({
  Icon,
  color,
}: {
  Icon: any;
  color: string;
  focused?: boolean;
}) {
  return (
    <View style={{ justifyContent: "center", alignItems: "center" }}>
      <Icon size={24} color={color} strokeWidth={2} />
    </View>
  );
}

function LogoutButton() {
  const { logout } = useAuthStore();
  const router = useRouter();
  const { showAlert } = useAlert();

  const handleLogout = () => {
    showAlert({
      title: "Cerrar Sesión",
      message: "¿Estás seguro de que deseas cerrar sesión?",
      type: "warning",
      buttons: [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Cerrar Sesión",
          style: "destructive",
          onPress: async () => {
            await logout();
            router.replace("/login");
          },
        },
      ],
    });
  };

  return (
    <TouchableOpacity
      onPress={handleLogout}
      style={styles.logoutButton}
      activeOpacity={0.7}
    >
      <LogOut size={24} color="#e74c3c" />
    </TouchableOpacity>
  );
}

function TabBar({ state, descriptors, navigation }: any) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const numTabs = state.routes.length;
  const tabWidth = TAB_BAR_WIDTH / numTabs;
  const isDownloading = useSyncStore((s) => s.isDownloading);

  const translateX = useSharedValue(state.index * tabWidth);

  useEffect(() => {
    translateX.value = withSpring(state.index * tabWidth, {
      damping: 20,
      stiffness: 200,
      overshootClamping: true,
    });
  }, [state.index, tabWidth]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: tabWidth,
  }));

  const activeColor = isDownloading ? "#7f8c8d" : "#156b33";
  const inactiveColor = isDark ? "#95a5a6" : "#7f8c8d";

  return (
    <View style={styles.tabBarContainer}>
      <BlurView
        intensity={100}
        tint={isDark ? "dark" : "light"}
        style={StyleSheet.absoluteFill}
      />

      {/* Sliding Indicator Background */}
      <Animated.View style={[styles.indicator, indicatorStyle]}>
        <View style={styles.indicatorInner} />
      </Animated.View>

      <View style={styles.tabItemsContainer}>
        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          const onPress = () => {
            if (isDownloading) return;
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const Icon = options.tabBarIcon
            ? (options.tabBarIcon as any)({
                color: isFocused ? activeColor : inactiveColor,
                focused: isFocused,
              }).props.Icon
            : Home;

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              style={styles.tabItem}
              activeOpacity={0.7}
            >
              <TabBarIcon
                Icon={Icon}
                color={isFocused ? activeColor : inactiveColor}
                focused={isFocused}
              />
              <Animated.Text
                style={[
                  styles.tabBarLabel,
                  { color: isFocused ? activeColor : inactiveColor },
                ]}
              >
                {options.title}
              </Animated.Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  const getHeaderOptions = (title: string) => ({
    headerTitle: title,
    headerStyle: {
      backgroundColor: colorScheme === "dark" ? "#0a1a10" : "#f4fbf7",
    },
    headerTitleStyle: {
      color: colorScheme === "dark" ? "#ECEDEE" : "#11181C",
      fontSize: responsiveFont(18),
      fontWeight: "600" as const,
    },
    headerRight: () => <LogoutButton />,
    headerShadowVisible: false,
  });

  const isDark = colorScheme === "dark";
  const bgColor = isDark ? "#0a1a10" : "#f4fbf7";

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Inicio",
            ...getHeaderOptions(TAB_TITLES.index),
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon Icon={Home} color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="projects"
          options={{
            title: "Proyectos",
            ...getHeaderOptions(TAB_TITLES.projects),
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon Icon={Briefcase} color={color} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="sync"
          options={{
            title: "Sincronizar",
            ...getHeaderOptions(TAB_TITLES.sync),
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon Icon={RefreshCw} color={color} focused={focused} />
            ),
          }}
        />
      </Tabs>
      <LinearGradient
        colors={["transparent", bgColor]}
        locations={[0, 0.55]}
        style={styles.bottomFade}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.05)",
    overflow: "hidden",
    backgroundColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    zIndex: 10,
  },
  tabItemsContainer: {
    flex: 1,
    flexDirection: "row",
    height: "100%",
  },
  tabItem: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  indicator: {
    position: "absolute",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  indicatorInner: {
    width: "80%",
    height: "80%",
    backgroundColor: "rgba(26, 122, 58, 0.15)",
    borderRadius: 20,
  },
  tabBarLabel: {
    fontSize: responsiveFont(17),
    fontWeight: "500",
    marginTop: 2,
  },
  logoutButton: {
    marginRight: widthScale(16),
    padding: widthScale(8),
  },
  bottomFade: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
    zIndex: 0,
  },
});
