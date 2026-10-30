import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Vite blocks unknown hosts; allow ngrok tunnels (leading dot = any subdomain)
    // so phones can open the app over ngrok's https URL
    allowedHosts: [".ngrok-free.dev", ".ngrok-free.app", ".ngrok.app", ".ngrok.io"],
  },
});
