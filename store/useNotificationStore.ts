import { create } from "zustand";
import { Notification } from "../schemas/notification";

interface NotificationState {
    notifications: Notification[];
    addNotification: (notification: Partial<Notification>) => void;
    markAsRead: (id: string) => void;
    clearAll: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
    notifications: [
        {
            id: "n1",
            title: "Bienvenido",
            message: "Tu app se ha actualizado a Lucide Icons.",
            type: "success",
            isRead: false,
            createdAt: new Date(),
        } as Notification,
        {
            id: "n2",
            title: "Sugerencia",
            message: "Prueba el nuevo modo oscuro profundo.",
            type: "info",
            isRead: true,
            createdAt: new Date(),
        } as Notification,
    ],
    addNotification: (notification) =>
        set((state) => ({
            notifications: [
                {
                    id: Math.random().toString(36).substr(2, 9),
                    createdAt: new Date(),
                    isRead: false,
                    ...notification,
                } as Notification,
                ...state.notifications,
            ],
        })),
    markAsRead: (id) =>
        set((state) => ({
            notifications: state.notifications.map((n) =>
                n.id === id ? { ...n, isRead: true } : n
            ),
        })),
    clearAll: () => set({ notifications: [] }),
}));
