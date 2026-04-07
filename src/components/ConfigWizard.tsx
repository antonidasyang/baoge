"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";

interface Props {
  configPath: string;
  onClose: () => void;
  onSaved: () => void;
}

function Field({ label, value, setValue, type = "text", placeholder }: { label: string; value: string; setValue: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-widest text-white/40 font-mono mb-1.5">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 rounded-md bg-black/40 border border-white/10 focus:border-orange-500/60 outline-none text-white text-sm font-mono placeholder:text-white/20 transition-colors"
      />
    </label>
  );
}

export function ConfigWizard({ configPath, onClose, onSaved }: Props) {
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [chatModel, setChatModel] = useState("gpt-4o-mini");
  const [embeddingModel, setEmbeddingModel] = useState("text-embedding-3-small");
  const [visionModel, setVisionModel] = useState("gpt-4o");
  const [codingModel, setCodingModel] = useState("gpt-4o");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    if (!apiKey.trim()) { setError("API Key 必填"); return; }
    if (!baseUrl.trim()) { setError("Base URL 必填"); return; }
    if (!chatModel.trim()) { setError("Chat Model 必填"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/config/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey, chatModel, embeddingModel, visionModel, codingModel }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || "保存失败"); return; }
      onSaved();
    } catch (e: any) {
      setError(e?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl bg-[#0d0d0d] border border-orange-500/30 rounded-lg shadow-2xl shadow-orange-500/10 overflow-hidden">
        <div className="flex items-center justify-between px-7 py-5 border-b border-white/5">
          <div>
            <h2 className="text-lg font-black tracking-tight text-white">配置 LLM</h2>
            <p className="text-[10px] text-white/30 font-mono mt-1 truncate">将写入 {configPath}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 transition-colors" title="关闭">
            <X className="w-4 h-4 text-white/40" />
          </button>
        </div>

        <div className="p-7 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <Field label="Base URL" value={baseUrl} setValue={setBaseUrl} placeholder="https://api.openai.com/v1" />
          <Field label="API Key" value={apiKey} setValue={setApiKey} type="password" placeholder="sk-..." />
          <Field label="Chat Model" value={chatModel} setValue={setChatModel} placeholder="gpt-4o-mini" />
          <Field label="Embedding Model" value={embeddingModel} setValue={setEmbeddingModel} placeholder="text-embedding-3-small" />
          <Field label="Vision Model" value={visionModel} setValue={setVisionModel} placeholder="gpt-4o" />
          <Field label="Coding Model" value={codingModel} setValue={setCodingModel} placeholder="gpt-4o" />

          {error && (
            <div className="px-4 py-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-7 py-5 border-t border-white/5 bg-black/40">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-md border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition-colors text-xs font-bold uppercase tracking-wider"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 rounded-md bg-orange-500 text-black font-black hover:bg-orange-400 disabled:opacity-40 transition-colors text-xs uppercase tracking-wider flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
}
