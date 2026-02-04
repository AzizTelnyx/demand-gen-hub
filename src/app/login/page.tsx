"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/");
      } else {
        setError("Invalid password");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-gray-950 to-purple-900/20" />
      
      <div className="relative z-10 bg-gray-900/80 backdrop-blur-xl rounded-2xl shadow-2xl p-8 w-full max-w-md border border-gray-800">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <span className="text-2xl">📊</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Demand Gen Hub</h1>
          <p className="text-gray-400 mt-2">Enter password to continue</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              autoFocus
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-700/50 text-red-400 rounded-xl text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3.5 rounded-xl font-medium hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/25"
          >
            {loading ? "Checking..." : "Enter"}
          </button>
        </form>

        <p className="text-center text-gray-500 text-sm mt-6">
          Telnyx Marketing Team
        </p>
      </div>
    </div>
  );
}
