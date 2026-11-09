import { z } from "zod";

export const emailSchema = z.email().trim().max(254);

export const passwordSchema = z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères.").max(128);

export const registrationSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères.").max(128),
  displayName: z.string().trim().min(1).max(50),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const profileSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(24).regex(/^[a-z0-9_]+$/),
  displayName: z.string().trim().min(1).max(50),
  bio: z.string().trim().max(280),
});
