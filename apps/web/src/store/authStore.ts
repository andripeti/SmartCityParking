import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "../lib/api";

interface User {
  user_id: number;
  email: string;
  full_name: string;
  role: "driver" | "operator" | "officer" | "admin";
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,

      login: async (email: string, password: string) => {
        const response = await api.post("/auth/login", { email, password });
        const { access_token } = response.data;

        // Set token in axios defaults
        api.defaults.headers.common["Authorization"] = `Bearer ${access_token}`;

        // Get user info
        const userResponse = await api.get("/auth/me");
        const user = userResponse.data;

        set({
          token: access_token,
          user,
          isAuthenticated: true,
        });

        return user;
      },

      logout: () => {
        delete api.defaults.headers.common["Authorization"];
        set({
          token: null,
          user: null,
          isAuthenticated: false,
        });
      },

      setUser: (user: User) => {
        set({ user });
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ token: state.token }),
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          api.defaults.headers.common["Authorization"] =
            `Bearer ${state.token}`;
          // Verify token is still valid
          api
            .get("/auth/me")
            .then((response) => {
              state.setUser(response.data);
              useAuthStore.setState({ isAuthenticated: true });
            })
            .catch(() => {
              state.logout();
            });
        }
      },
    },
  ),
);
