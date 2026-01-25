import { z } from "zod";

export const NotificationSchema = z.object({
    id: z.string().uuid(),
    title: z.string().min(1),
    message: z.string().min(1),
    type: z.enum(["info", "success", "warning", "error"]).default("info"),
    isRead: z.boolean().default(false),
    createdAt: z.date().default(() => new Date()),
});

export type Notification = z.infer<typeof NotificationSchema>;
