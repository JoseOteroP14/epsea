# Project Context: Epsea (Expo / React Native)

## 1. Project Overview & Tech Stack

This project is a high-performance cross-platform mobile application built with **Expo SDK 54** and **React Native 0.81**.

- **Core Framework:** React 19.1.0, React Native 0.81.5 (New Architecture enabled implies latest standards).
- **Bundler/Runtime:** Bun (strictly used for package management and script execution).
- **Routing:** Expo Router v6 (File-based routing).
- **State Management:**
  - **Server State:** `@tanstack/react-query` v5.
  - **Client State:** `zustand` v5.
- **Styling:** Custom JS-based styling system (StyleSheet) adhering to strict design tokens.
- **Validation:** `zod` for schema validation.
- **Animations:** `react-native-reanimated` v4.

## 2. Behavioral Guidelines for AI

1. **Misconception Check:** Before providing code solutions, briefly analyze if the request implies a conceptual error or antipattern (e.g., mutating state directly, using legacy React Navigation patterns in Expo Router).
2. **Modern Standards:** Always use the latest React 19 patterns (Server Components concepts where applicable, efficient hooks) and strict TypeScript.
3. **Package Manager:** Always use `bun install` or `bun expo start`. Do not suggest `npm` or `yarn`.
4. **Usage of libraries:** Dont write vanilla TypeScript code where some library/dependency in package.json already provides a solution

## 3. UI/UX & Design System Constraints

**Strict Rule:** Do not introduce external UI libraries (like NativeBase or Tamagui) unless explicitly requested. Adhere to the provided `Colors` and `Fonts` objects.

### 3.1 Color Palette & Dark Mode

Support both Light and Dark modes using `useColorScheme`.

- **Reference Implementation:**

```typescript
import { useColorScheme } from 'react-native';
import { Colors } from '@/constants/Colors'; // Adjust path as needed

// Usage
const colorScheme = useColorScheme();
const theme = Colors[colorScheme ?? 'light'];
// Use theme.background, theme.text, etc.

 Voy a buscar las versiones actualizadas de Expo SDK y el ecosistema para darte información precisa.  
  Ahora busco las últimas versiones de las librerías del ecosistema:    
  Necesito verificar la versión exacta de React Native incluida en Expo SDK 54:    
 Aquí tienes el **raw markdown** actualizado con las versiones exactas disponibles hoy (Enero 2026):

```markdown
# 🚀 Expo SDK 54 + React Native 0.81 Ultimate Guide

> **Stack Actual**: Expo SDK 54.0.32 | React Native 0.81.4 | React 19.1 | Expo Router 6
> **Requisitos**: Node.js 20.19+, TypeScript 5.9+, Xcode 16.1+, New Architecture (default)

---

## 📁 Estructura de Carpetas (SDK 54+ Pattern)

```

my-app/
├── app/                            # Expo Router v6 (file-based)
│   ├── (auth)/                     # Route groups
│   │   ├── _layout.tsx             # Stack con Native Tabs (iOS/Android)
│   │   ├── login.tsx
│   │   └── register.tsx
│   ├── (tabs)/                     # Native Tabs (SDK 54 beta feature)
│   │   ├──_layout.tsx             # Tabs nativos con Liquid Glass (iOS 26)
│   │   ├── index.tsx
│   │   ├── explore.tsx
│   │   └── profile.tsx
│   ├── _layout.tsx                 # Root layout + Auth Guard
│   ├── +not-found.tsx
│   └── +html.tsx                   # Web HTML wrapper (SDK 54)
├── src/
│   ├── components/
│   │   ├── ui/                     # Primitives (Button, Input, Card)
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   └── Text.tsx
│   │   └── features/               # Domain-specific
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   └── useUser.ts              # TanStack Query v5 patterns
│   ├── stores/                     # Zustand v5
│   │   ├── auth.store.ts
│   │   └── ui.store.ts
│   ├── lib/
│   │   ├── api.ts                  # Axios + interceptors
│   │   ├── utils.ts                # cn(), formatters
│   │   ├── env.ts                  # Zod v4 validation
│   │   └── constants.ts
│   ├── schemas/                    # Zod v4
│   │   ├── auth.schema.ts
│   │   └── user.schema.ts
│   ├── types/
│   │   └── index.d.ts
│   └── services/                   # API calls (TanStack Query v5)
│       ├── auth.service.ts
│       └── user.service.ts
├── assets/
│   ├── images/
│   ├── fonts/
│   └── app.icon                    # iOS 26 Liquid Glass (SDK 54)
├── .env.local
├── .env.production
├── app.json                        # enableBsdiffPatchSupport (Hermes diffing)
├── babel.config.js                 # jsxImportSource: nativewind
├── tailwind.config.js              # NativeWind v4.2+
├── package.json
└── tsconfig.json                   # Strict mode + path aliases

```

---

## ⚙️ TypeScript Configuration (Strict)

```json
// tsconfig.json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "~/*": ["src/*"],
      "@assets/*": ["assets/*"]
    },
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "jsx": "react-jsx",
    "jsxImportSource": "nativewind"
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

---

## 🔐 Environment Variables (Zod v4)

```typescript
// src/lib/env.ts
import { z } from 'zod';

// Zod v4 - nueva sintaxis de import (no más zod/v4)
const envSchema = z.object({
  EXPO_PUBLIC_API_URL: z.string().url(),
  EXPO_PUBLIC_APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  EXPO_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  EXPO_PUBLIC_SENTRY_DSN: z.string().url().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', JSON.stringify(parsed.error.issues, null, 2));
  throw new Error('Invalid environment variables');
}

export const Env = parsed.data;
export type Env = z.infer<typeof envSchema>;
```

---

## 🏪 Global State (Zustand v5)

```typescript
// src/stores/auth.store.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';

const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  avatar_url: z.string().url().optional(),
});

export type User = z.infer<typeof userSchema>;

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  setUser: (user: User | null) => void;
  updateUser: (data: Partial<User>) => void;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
  setAccessToken: (token: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isHydrated: false,

      setUser: (user) => set({ 
        user, 
        isAuthenticated: !!user 
      }),

      updateUser: (data) => set((state) => ({
        user: state.user ? { ...state.user, ...data } : null
      })),

      setAccessToken: async (token) => {
        await SecureStore.setItemAsync('access_token', token);
      },

      getAccessToken: async () => {
        return await SecureStore.getItemAsync('access_token');
      },

      logout: async () => {
        await SecureStore.deleteItemAsync('access_token');
        // SDK 54: Limpieza completa de stores persistidos
        await AsyncStorage.multiRemove(['auth-storage', 'user-preferences']);
        set({ user: null, isAuthenticated: false });
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ 
        user: state.user,
        isAuthenticated: state.isAuthenticated 
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) console.error('Auth hydration failed:', error);
        if (state) state.isHydrated = true;
      },
    }
  )
);

// Selectors optimizados (Zustand v5 recomienda esto)
export const selectUser = (state: AuthState) => state.user;
export const selectIsAuth = (state: AuthState) => state.isAuthenticated;
export const selectIsHydrated = (state: AuthState) => state.isHydrated;
```

---

## 🛡️ Validation Schemas (Zod v4)

```typescript
// src/schemas/auth.schema.ts
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[0-9]/, 'Must contain number'),
  confirmPassword: z.string(),
  name: z.string().min(2, 'Name too short'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

// Zod v4: Nuevo método `pipe` para transforms
export const userIdSchema = z.string().uuid().brand<"UserId">();
```

---

## 🌐 API Layer (Axios + React Native 0.81)

```typescript
// src/lib/api.ts
import axios from 'axios';
import { Env } from './env';
import { useAuthStore } from '~/stores/auth.store';

export const api = axios.create({
  baseURL: Env.EXPO_PUBLIC_API_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Request interceptor con SecureStore
api.interceptors.request.use(
  async (config) => {
    const token = await useAuthStore.getState().getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor con refresh token (SDK 54 pattern)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        // Implementar refresh token logic aquí
        // const newToken = await refreshToken();
        // await useAuthStore.getState().setAccessToken(newToken);
        // originalRequest.headers.Authorization = `Bearer ${newToken}`;
        // return api(originalRequest);
      } catch (refreshError) {
        await useAuthStore.getState().logout();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
```

---

## ⚡ Data Fetching (TanStack Query v5 - Nuevas APIs)

> **Nota v5**: Solo syntax de objeto, `isPending` en lugar de `isLoading`, `gcTime` en lugar de `cacheTime`

```typescript
// src/hooks/useAuthQueries.ts
import { 
  useQuery, 
  useMutation, 
  useQueryClient,
  keepPreviousData  // Nuevo helper en v5
} from '@tanstack/react-query';
import { api } from '~/lib/api';
import { loginSchema, type LoginInput } from '~/schemas/auth.schema';

const AUTH_KEYS = {
  all: ['auth'] as const,
  user: () => [...AUTH_KEYS.all, 'user'] as const,
  users: (filters: string) => [...AUTH_KEYS.all, 'users', filters] as const,
};

// React Native 0.81 + New Architecture: Mejor manejo de errores
export function useUser() {
  return useQuery({
    queryKey: AUTH_KEYS.user(),
    queryFn: async () => {
      const { data } = await api.get('/me');
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutos
    gcTime: 10 * 60 * 1000,   // v5: garbage collect time (reemplaza cacheTime)
    retry: 2,
    // v5: keepPreviousData ahora es placeholderData: keepPreviousData
    placeholderData: keepPreviousData,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);
  const setAccessToken = useAuthStore((state) => state.setAccessToken);

  return useMutation({
    mutationFn: async (credentials: LoginInput) => {
      // Validación Zod v4 antes de enviar
      const parsed = loginSchema.parse(credentials);
      const { data } = await api.post('/auth/login', parsed);
      return data;
    },
    onSuccess: async (data) => {
      await setAccessToken(data.access_token);
      setUser(data.user);
      queryClient.setQueryData(AUTH_KEYS.user(), data.user);
    },
    onError: (error) => {
      // SDK 54: React Native 0.81 mejora manejo de errores nativos
      console.error('Login error:', error);
    }
  });
}

// Infinite Query v5: Nuevo maxPages y initialPageParam requerido
export function useInfinitePosts() {
  return useInfiniteQuery({
    queryKey: ['posts'],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get(`/posts?cursor=${pageParam}`);
      return data;
    },
    initialPageParam: 0, // v5: Requerido (antes default parameter)
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    maxPages: 3, // v5: Limitar páginas en memoria
  });
}
```

---

## 🎨 Styling (NativeWind v4.2+)

```javascript
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,tsx}', 
    './src/**/*.{js,ts,tsx}'
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0284c7',
          foreground: '#ffffff',
        },
      },
    },
  },
  plugins: [],
};

// babel.config.js
module.exports = function(api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }]],
    plugins: [
      // Reanimated plugin ya viene incluido en babel-preset-expo en SDK 54
    ],
  };
};
```

```typescript
// src/lib/utils.ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

---

## 🧩 UI Components (CVA + NativeWind)

```typescript
// src/components/ui/Button.tsx
import { TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '~/lib/utils';

const buttonVariants = cva(
  'flex-row items-center justify-center rounded-lg active:opacity-80',
  {
    variants: {
      variant: {
        default: 'bg-primary',
        destructive: 'bg-red-500',
        outline: 'border-2 border-primary bg-transparent',
        ghost: 'bg-transparent',
      },
      size: {
        default: 'h-12 px-6',
        sm: 'h-9 px-3',
        lg: 'h-14 px-8',
        icon: 'h-12 w-12',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

interface ButtonProps
  extends React.ComponentProps<typeof TouchableOpacity>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

export function Button({ 
  className, 
  variant, 
  size, 
  children, 
  isLoading,
  disabled,
  ...props 
}: ButtonProps) {
  return (
    <TouchableOpacity
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={isLoading || disabled}
      activeOpacity={0.8}
      {...props}
    >
      {isLoading ? (
        <ActivityIndicator 
          size="small" 
          color={variant === 'outline' || variant === 'ghost' ? '#0284c7' : '#fff'} 
        />
      ) : (
        <Text className={cn(
          'font-semibold text-white',
          variant === 'outline' && 'text-primary',
          variant === 'ghost' && 'text-primary'
        )}>
          {children}
        </Text>
      )}
    </TouchableOpacity>
  );
}
```

---

## 🚦 App Entry & Routing (Expo Router v6)

```typescript
// app/_layout.tsx
import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useColorScheme } from 'nativewind';
import { useAuthStore, selectIsAuth, selectIsHydrated } from '~/stores/auth.store';
import { View } from 'react-native';

// SDK 54: Nueva configuración de QueryClient
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 2,
      refetchOnWindowFocus: false,
      // v5: isPending es el nuevo isLoading
    },
    mutations: {
      retry: false,
    },
  },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const segments = useSegments();
  const router = useRouter();
  const isAuthenticated = useAuthStore(selectIsAuth);
  const isHydrated = useAuthStore(selectIsHydrated);

  useEffect(() => {
    if (!isHydrated) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, segments, isHydrated]);

  if (!isHydrated) {
    return <View className="flex-1 bg-white" />;
  }

  return <>{children}</>;
}

export default function RootLayout() {
  const { colorScheme } = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthGuard>
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
          <Slot />
        </AuthGuard>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
```

```typescript
// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import { Home, User, Compass } from 'lucide-react-native';

// SDK 54: Native Tabs (beta) para iOS 26 Liquid Glass
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0284c7',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Home size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => <Compass size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
```

---

## 🔒 Security & Storage (SDK 54)

```typescript
// src/lib/secure-storage.ts
import * as SecureStore from 'expo-secure-store';

export const TokenStorage = {
  async getToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync('jwt_token');
    } catch {
      return null;
    }
  },
  
  async setToken(token: string): Promise<void> {
    await SecureStore.setItemAsync('jwt_token', token);
  },
  
  async deleteToken(): Promise<void> {
    await SecureStore.deleteItemAsync('jwt_token');
  },
};

// SDK 54: expo-file-system/next ahora es estable (reemplaza legacy)
import * as FileSystem from 'expo-file-system';

export async function saveLocalFile(uri: string, filename: string) {
  // Nueva API orientada a objetos (SDK 54 default)
  const file = new FileSystem.File(uri);
  const destination = FileSystem.documentDirectory + filename;
  await file.copy(destination);
  return destination;
}
```

---

## 📦 package.json (Versiones Exactas SDK 54)

```json
{
  "name": "my-expo-app",
  "version": "1.0.0",
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "prebuild": "expo prebuild",
    "type-check": "tsc --noEmit",
    "lint": "expo lint"
  },
  "dependencies": {
    "expo": "~54.0.32",
    "expo-router": "~6.0.22",
    "expo-secure-store": "~14.0.0",
    "expo-image": "~2.0.0",
    "expo-file-system": "~19.0.0",
    "expo-status-bar": "~3.0.0",
    "expo-system-ui": "~4.0.0",
    "expo-web-browser": "~15.0.0",
    "expo-updates": "~0.27.0",
    
    "react": "19.1.0",
    "react-native": "0.81.4",
    "react-native-reanimated": "4.1.2",
    "react-native-gesture-handler": "~2.28.0",
    "react-native-safe-area-context": "5.6.1",
    "react-native-screens": "~4.16.0",
    "react-native-svg": "15.12.1",
    "react-native-worklets": "0.5.1",
    
    "zustand": "^5.0.0",
    "zod": "^4.1.12",
    "@hookform/resolvers": "^5.0.0",
    "@tanstack/react-query": "^5.62.0",
    "axios": "^1.7.0",
    "react-hook-form": "^7.71.1",
    
    "nativewind": "^4.2.0",
    "tailwindcss": "^3.4.0",
    "tailwind-merge": "^2.6.0",
    "clsx": "^2.1.0",
    "class-variance-authority": "^0.7.0",
    
    "@react-native-async-storage/async-storage": "2.2.0",
    "@shopify/flash-list": "1.7.0",
    "lucide-react-native": "^0.460.0"
  },
  "devDependencies": {
    "@babel/core": "^7.25.0",
    "@types/react": "~19.1.0",
    "typescript": "~5.9.2"
  },
  "expo": {
    "autolinking": {
      "legacy_shallowReactNativeLinking": false
    },
    "experiments": {
      "autolinkingModuleResolution": true,
      "enableBsdiffPatchSupport": true
    }
  }
}
```

---

## 🚀 Configuration Files

```json
// app.json (SDK 54 specific)
{
  "expo": {
    "name": "MyApp",
    "slug": "my-app",
    "version": "1.0.0",
    "sdkVersion": "54.0.0",
    "newArchEnabled": true,
    "ios": {
      "icon": "./assets/app.icon",
      "supportsTablet": true,
      "bundleIdentifier": "com.example.myapp"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "package": "com.example.myapp"
    },
    "plugins": [
      [
        "expo-build-properties",
        {
          "ios": {
            "newArchEnabled": true,
            "buildReactNativeFromSource": false
          },
          "android": {
            "newArchEnabled": true,
            "enableProguardInReleaseBuilds": true
          }
        }
      ]
    ],
    "updates": {
      "url": "https://u.expo.dev/your-project-id",
      "enableBsdiffPatchSupport": true
    }
  }
}
```

---

## ✅ Checklist SDK 54 Production

- [ ] **New Architecture**: Obligatoria en SDK 54 (no se puede desactivar en 55)
- [ ] **Zod v4**: Migrar de `zod/v4` subpath a `zod` (root ya exporta v4)
- [ ] **TanStack Query v5**: Usar object syntax, `isPending` vs `isLoading`, `gcTime`
- [ ] **Reanimated v4**: Solo soporta New Architecture + requiere `react-native-worklets`
- [ ] **expo-file-system**: Importar desde `expo-file-system` (next es ahora default)
- [ ] **Node.js**: Mínimo 20.19.x
- [ ] **TypeScript**: ~5.9.2 recomendado
- [ ] **Hermes Diffing**: Habilitar `enableBsdiffPatchSupport` para updates 75% más pequeños
- [ ] **Liquid Glass**: Iconos `.icon` para iOS 26 (opcional)
- [ ] **SecureStore**: Tokens nunca en AsyncStorage
- [ ] **Splash Screen**: Usar `expo-splash-screen` ~0.29.x (API renovada)

---

## 🎯 SDK 54 Breaking Changes Importantes

1. **React Native 0.81**: Owner stacks habilitados por defecto
2. **JSC Removido**: Solo Hermes soportado oficialmente
3. **expo-av removido**: Migrar a `expo-audio` + `expo-video`
4. **expo-notifications**: Field `notification` removido de app.json
5. **Metro 0.83**: No importar desde `metro/src/*`, usar `metro/private/*`
6. **SafeAreaView**: Deprecado de RN core, usar `react-native-safe-area-context`

```
