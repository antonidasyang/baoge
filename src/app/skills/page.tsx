"use client";

import { useState, useEffect, useCallback } from "react";
import { LeopardLogo } from "@/components/LeopardLogo";
import { Trash2, Plus, Loader2 } from "lucide-react";

interface Skill {
  name: string;
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [installSource, setInstallSource] = useState("");
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/skills");
      const data = await res.json();
      setSkills(data.skills || []);
    } catch {
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleInstall = async () => {
    const src = installSource.trim();
    if (!src) return;
    setInstalling(true);
    setError("");
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: src }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "安装失败");
      setInstallSource("");
      await refresh();
    } catch (e: any) {
      setError(e.message || "安装失败");
    } finally {
      setInstalling(false);
    }
  };

  const handleRemove = async (name: string) => {
    if (!confirm(`确定移除技能「${name}」？`)) return;
    try {
      const res = await fetch(`/api/skills?name=${encodeURIComponent(name)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      await refresh();
    } catch {
      setError("移除失败");
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0] font-sans">
      <header className="h-14 flex items-center justify-between px-6 border-b border-white/5 bg-black/40 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <a href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <LeopardLogo className="w-6 h-6 text-orange-500" />
            <span className="font-bold text-sm">豹哥 · 技能管理</span>
          </a>
        </div>
        <a href="/" className="text-[10px] text-white/40 hover:text-orange-500 transition-colors font-mono uppercase tracking-wider">
          返回
        </a>
      </header>
      <div className="max-w-2xl mx-auto py-10 px-6">
        <div className="mb-8">
          <p className="text-white/50 text-sm mb-2">安装技能后，豹哥可根据大模型调度调用技能中的工具。技能需为含 index.ts 的目录，导出 name、description、parameters、execute。</p>
          <div className="flex gap-2">
            <input
              className="flex-1 px-4 py-3 bg-[#111]/80 border border-white/10 rounded-xl text-white placeholder:text-white/30 text-sm outline-none focus:border-orange-500/40"
              placeholder="Git URL，如 https://github.com/xxx/baoge-skill-xxx"
              value={installSource}
              onChange={(e) => { setInstallSource(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleInstall()}
            />
            <button
              onClick={handleInstall}
              disabled={installing || !installSource.trim()}
              className="px-5 py-3 bg-orange-500 text-black font-semibold rounded-xl hover:bg-orange-400 disabled:opacity-40 flex items-center gap-2"
            >
              {installing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              安装
            </button>
          </div>
          {error && <p className="text-red-400/80 text-sm mt-2">{error}</p>}
        </div>

        <h3 className="text-white/60 text-xs font-mono uppercase tracking-wider mb-4">已安装 ({skills.length})</h3>
        {loading ? (
          <p className="text-white/40 py-8">加载中…</p>
        ) : skills.length === 0 ? (
          <p className="text-white/30 py-8">暂无技能。使用 <code className="bg-white/10 px-1 rounded">pnpm run skill add &lt;来源&gt;</code> 或上方表单安装。</p>
        ) : (
          <div className="space-y-2">
            {skills.map((s) => (
              <div key={s.name} className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border border-white/5 rounded-xl">
                <span className="font-medium text-orange-500/90">{s.name}</span>
                <button
                  onClick={() => handleRemove(s.name)}
                  className="p-2 text-white/30 hover:text-red-400 transition-colors"
                  title="移除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
