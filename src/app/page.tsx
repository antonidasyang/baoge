"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, User, Loader2, Plus, MessageSquare, Paperclip, X, FileIcon, FolderUp, Square } from "lucide-react";
import { LeopardLogo } from "@/components/LeopardLogo";
import { MarkdownRenderer } from "@/components/MarkdownRenderer"; // 引入 Markdown 渲染器
import { ConfigWizard } from "@/components/ConfigWizard";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
}

interface Session {
  id: string;
  title: string;
  updatedAt: number;
}

interface FileWithPath {
  file: File;
  path: string;
}

export default function BaogePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<FileWithPath[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [skillsCount, setSkillsCount] = useState(0);
  const [loadedSkills, setLoadedSkills] = useState<string[]>([]);
  const [configStatus, setConfigStatus] = useState<{ configured: boolean; configPath: string } | null>(null);
  const [showWizard, setShowWizard] = useState(false);

  const refreshConfig = useCallback(async () => {
    try {
      const r = await fetch('/api/config/status');
      const data = await r.json();
      setConfigStatus(data);
      if (!data.configured) setShowWizard(true);
    } catch {}
  }, []);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<{ controller: AbortController; requestId: string } | null>(null);

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      if (data.sessions) setSessions(data.sessions);
      return data.sessions;
    } catch (e) { return []; }
  }, []);

  const refreshSkills = useCallback(async () => {
    try {
      const res = await fetch('/api/skills');
      const data = await res.json();
      setSkillsCount(data.skills?.length ?? 0);
    } catch { setSkillsCount(0); }
  }, []);

  const createNewSession = async () => {
    const newId = `session_${Date.now()}`;
    setSessionId(newId);
    setMessages([{ role: "assistant", content: "豹哥已上线。系统内核稳定，等待录入指令。" }]);
    await fetch('/api/sessions', { method: 'POST', body: JSON.stringify({ id: newId, title: "新任务" }), headers: { "Content-Type": "application/json" } });
    await refreshSessions();
  };

  const switchSession = async (id: string) => {
    if (id === sessionId && messages.length > 0) return;
    setSessionId(id);
    try {
      const res = await fetch(`/api/sessions?sessionId=${id}`);
      const data = await res.json();
      if (data.history) {
        setMessages(data.history.length === 0 ? [{ role: "assistant", content: "豹哥已上线。本对话尚无记录。" }] : data.history.map((h: any) => ({ role: h.role, content: h.content })));
      }
    } catch {}
  };

  useEffect(() => {
    refreshSessions().then(list => { if (list && list.length > 0) switchSession(list[0].id); else createNewSession(); });
    refreshSkills();
    refreshConfig();
  }, []);

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isLoading]);

  const traverseFileTree = async (item: any, path: string = ""): Promise<FileWithPath[]> => {
    return new Promise((resolve) => {
      if (item.isFile) {
        item.file((file: File) => { resolve([{ file, path: path + file.name }]); });
      } else if (item.isDirectory) {
        const dirReader = item.createReader();
        dirReader.readEntries(async (entries: any[]) => {
          const results = await Promise.all(entries.map(entry => traverseFileTree(entry, path + item.name + "/")));
          resolve(results.flat());
        });
      }
    });
  };

  const handleUpload = async (fileList: FileWithPath[]): Promise<{ path: string; name: string }[]> => {
    setUploading(true);
    const formData = new FormData();
    fileList.forEach(item => { formData.append('files', item.file); formData.append('paths', item.path); });
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        const fileNames = fileList.map(f => f.file.name).join(', ');
        setMessages(prev => [...prev, { role: "assistant", content: `✅ [系统登记] 成功挂载资产: ${fileNames}` }]);
        return (data.assets || []).map((a: { path: string; name: string }) => ({ path: a.path, name: a.name }));
      }
    } catch (e) { alert("上传失败"); } finally { setUploading(false); setAttachedFiles([]); }
    return [];
  };

  const handleSend = async () => {
    if (!input.trim() && attachedFiles.length === 0) return;
    if (isLoading) return;
    let uploadedAssets: { path: string; name: string }[] = [];
    if (attachedFiles.length > 0) uploadedAssets = await handleUpload(attachedFiles);
    if (!input.trim()) return;
    const displayInput = input;
    let apiPrompt = input;
    if (uploadedAssets.length > 0) {
      const assetHint = uploadedAssets.map(a => `${a.name}: ${a.path}`).join('\n');
      apiPrompt = `${input}\n\n[当前会话刚上传的资产，可直接使用以下路径]\n${assetHint}`;
    }
    setInput("");
    setIsLoading(true);
    let toolStatus = "";
    let mainContent = "";
    const toolsUsedThisTurn: string[] = [];
    const getFullContent = () => (toolStatus ? toolStatus + (mainContent ? "\n\n" + mainContent : "") : mainContent) || "";
    setMessages(prev => [...prev, { role: "user", content: displayInput }, { role: "assistant", content: "" }]);
    const streamMsgIdx = messages.length + 1;
    const updateMsg = (content: string) => setMessages(prev => { const n = [...prev]; n[streamMsgIdx] = { role: "assistant", content }; return n; });
    const ac = new AbortController();
    const rid = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    abortRef.current = { controller: ac, requestId: rid };
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ prompt: apiPrompt, sessionId, requestId: rid }),
        headers: { "Content-Type": "application/json" },
        signal: ac.signal
      });
      if (!res.ok || !res.body) throw new Error("Stream failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === "skills_loaded") {
              const all = [...(ev.skillMd || []), ...(ev.tools || [])];
              if (all.length > 0) setLoadedSkills(all);
            } else if (ev.type === "tool_start") {
              const agentLabel = ev.agentName && ev.agentName !== 'main' ? `[${ev.agentName}] ` : "";
              toolsUsedThisTurn.push(`${agentLabel}${ev.toolName}`);
              let argStr = "";
              if (ev.args && typeof ev.args === "object") {
                const a = ev.args;
                argStr = a.command ?? (a.operation && a.path ? `${a.operation} ${a.path}` : a.path) ?? JSON.stringify(a).slice(0, 60);
              } else if (ev.args) argStr = String(ev.args).slice(0, 60);
              toolStatus += `⚡ **${agentLabel}正在执行:** \`${ev.toolName}\`${argStr ? ` \`${String(argStr).slice(0, 80)}${String(argStr).length > 80 ? "…" : ""}\`` : ""}\n\n`;
            } else if (ev.type === "tool_end") {
              const agentLabel = ev.agentName && ev.agentName !== 'main' ? `[${ev.agentName}] ` : "";
              toolStatus += `✅ **${agentLabel}**\`${ev.toolName}\` 已完成\n\n`;
            } else if (ev.type === "text_delta" && ev.delta) {
              mainContent += ev.delta;
            } else if (ev.type === "message_end" && ev.text) {
              mainContent = ev.text;
            } else if (ev.type === "error") {
              mainContent += `\n\n⚠️ ${ev.message}`;
            } else if (ev.type === "done" && !getFullContent().trim()) {
              mainContent = "豹哥想了想，没有给出明确回复。";
            } else if (ev.type === "aborted") {
              mainContent += (mainContent ? "\n\n" : "") + "⚠️ 已停止。";
            }
            updateMsg(getFullContent());
          } catch (_) {}
        }
      }
      await refreshSessions();
    } catch (err) {
      const aborted = (err as Error)?.name === 'AbortError';
      if (!aborted) updateMsg(getFullContent() || "⚠️ 豹哥内核连接异常。");
      else if (!getFullContent().trim()) updateMsg("⚠️ 已停止。");
    } finally {
      if (toolsUsedThisTurn.length > 0) {
        setMessages(prev => {
          const n = [...prev];
          const idx = n.length - 1;
          if (n[idx]?.role === "assistant") {
            n[idx] = { ...n[idx], toolsUsed: toolsUsedThisTurn };
          }
          return n;
        });
      }
      abortRef.current = null;
      setIsLoading(false);
    }
  };

  const handleStop = () => {
    const current = abortRef.current;
    if (!current) return;
    current.controller.abort();
    fetch('/api/chat/abort', {
      method: 'POST',
      body: JSON.stringify({ requestId: current.requestId }),
      headers: { 'Content-Type': 'application/json' }
    }).catch(() => {});
  };

  return (
    <main 
      className="flex h-screen bg-[#0a0a0a] text-[#e0e0e0] font-sans overflow-hidden relative"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setIsDragging(false);
        const items = Array.from(e.dataTransfer.items);
        if (items.length > 0 && typeof items[0].webkitGetAsEntry === 'function') {
          const results = await Promise.all(items.map(item => traverseFileTree(item.webkitGetAsEntry!())));
          setAttachedFiles(prev => [...prev, ...results.flat()]);
        } else {
          const files = Array.from(e.dataTransfer.files).map(f => ({ file: f, path: f.name }));
          setAttachedFiles(prev => [...prev, ...files]);
        }
      }}
    >
      {showWizard && configStatus && (
        <ConfigWizard
          configPath={configStatus.configPath}
          onClose={() => setShowWizard(false)}
          onSaved={() => { setShowWizard(false); refreshConfig(); }}
        />
      )}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-orange-500/20 backdrop-blur-xl border-4 border-dashed border-orange-500 flex items-center justify-center pointer-events-none">
          <div className="text-center animate-bounce"><FolderUp className="w-20 h-20 text-orange-500 mx-auto" /><p className="text-2xl font-black text-white mt-4 uppercase italic tracking-widest">释放以部署资产</p></div>
        </div>
      )}

      <aside className="w-16 md:w-72 bg-[#0d0d0d] border-r border-white/5 flex flex-col p-4 shadow-2xl z-20">
        <div className="flex items-center gap-3 px-2 mb-8 mt-2 cursor-pointer" onClick={() => refreshSessions()}><div className="w-10 h-10 bg-orange-500 rounded-md flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/20"><LeopardLogo className="w-7 h-7 text-white" /></div><div className="hidden md:block italic tracking-tighter"><h1 className="font-black text-xl leading-tight">BAOGE</h1><p className="text-[9px] text-white/30 font-mono tracking-widest uppercase">Stealth Mode On</p></div></div>
        <button onClick={createNewSession} className="flex items-center gap-3 w-full p-4 bg-white/5 border border-white/10 text-white font-bold rounded-lg transition-all hover:bg-white/10 mb-8 active:scale-95"><Plus className="w-5 h-5 text-orange-500" /><span className="text-xs hidden md:block uppercase font-black tracking-widest">New Mission</span></button>
        <div className="flex-1 overflow-y-auto space-y-2 px-1 custom-scrollbar">
          <a href="/skills" className="block px-4 py-3 mb-2 border-b border-white/5 hover:bg-white/5 rounded-md transition-colors" title={loadedSkills.length > 0 ? `已加载: ${loadedSkills.join(', ')}` : undefined}>
            <p className="text-[10px] text-white/40 font-mono uppercase tracking-wider">技能</p>
            <p className="text-sm font-semibold text-orange-500/80 mt-0.5">{skillsCount} 个</p>
            {loadedSkills.length > 0 && <p className="text-[10px] text-white/30 mt-1 truncate">{loadedSkills.join(', ')}</p>}
          </a>
          {sessions.map((s) => (
            <div key={s.id} onClick={() => switchSession(s.id)} className={`flex items-center gap-3 px-4 py-4 rounded-lg cursor-pointer transition-all border ${sessionId === s.id ? "bg-white/5 text-orange-500 border-orange-500/20" : "bg-transparent text-white/20 border-transparent hover:bg-white/5"}`}><MessageSquare className="w-4 h-4 shrink-0" /><span className="text-sm font-semibold truncate hidden md:block">{s.title}</span></div>
          ))}
        </div>
      </aside>

      <div className="flex-1 flex flex-col relative bg-gradient-to-br from-[#0d0d0d] via-[#0a0a0a] to-[#0d0d0d]">
        {configStatus && !configStatus.configured && (
          <div className="px-10 py-3 bg-orange-500/10 border-b border-orange-500/30 text-[12px] text-orange-200 flex items-center justify-between gap-4 z-20">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-orange-500 font-black uppercase tracking-widest text-[10px] font-mono shrink-0">⚠ 未配置 LLM</span>
              <span className="truncate">
                请在 <code className="px-1.5 py-0.5 rounded bg-black/40 text-orange-300 font-mono">{configStatus.configPath}</code> 中配置 provider 与 apiKey 后重启服务。
              </span>
            </div>
            <button
              onClick={() => setShowWizard(true)}
              className="shrink-0 px-3 py-1 rounded-md border border-orange-500/40 hover:bg-orange-500/20 font-mono uppercase tracking-wider text-[10px]"
            >
              立即配置
            </button>
          </div>
        )}
        <header className="h-16 flex items-center justify-between px-10 border-b border-white/5 backdrop-blur-xl z-10 bg-black/40">
          <div className="flex items-center gap-3"><div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)] animate-pulse" /><span className="text-[9px] font-bold text-white/30 tracking-[0.4em] uppercase font-mono">Terminal Online</span></div>
          <div className="flex items-center gap-4">
            <a href="/skills" className="text-[10px] text-white/30 hover:text-orange-500 transition-colors font-mono uppercase tracking-wider">技能</a>
            <a href="/changelog" className="text-[10px] text-white/30 hover:text-orange-500 transition-colors font-mono uppercase tracking-wider">更新日志</a>
            <a href="/debug" className="text-[10px] text-white/30 hover:text-orange-500 transition-colors font-mono uppercase tracking-wider">运行监控</a>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 custom-scrollbar">
          <div className="max-w-3xl mx-auto py-16 space-y-12 pb-48">
            {messages.map((m, i) => (m.role === "assistant" && !m.content?.trim()) ? null :
              <div key={i} className={`flex gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700 ${m.role === "user" ? "justify-end" : ""}`}>
                {m.role === "assistant" && <div className="w-12 h-12 rounded-lg bg-orange-500/5 border border-orange-500/10 flex items-center justify-center shrink-0 shadow-2xl"><LeopardLogo className="w-7 h-7 text-orange-500" /></div>}
                <div className={`px-4 py-3 rounded-lg max-w-[85%] border shadow-2xl transition-all duration-500 ${m.role === "user" ? "bg-orange-500 text-black font-medium border-orange-600 rounded-tr-sm" : "bg-white/[0.02] text-white/80 border-white/5 rounded-tl-sm shadow-black"}`}>
                  {m.role === "assistant" && m.toolsUsed && m.toolsUsed.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3 pb-3 border-b border-white/10">
                      <span className="text-[10px] text-white/40 font-mono uppercase tracking-wider">本次调用</span>
                      {m.toolsUsed.map((t, j) => (
                        <span key={j} className="px-2 py-0.5 rounded-md bg-orange-500/20 text-orange-500 text-xs font-mono">{t}</span>
                      ))}
                    </div>
                  )}
                  {m.role === "user" ? (
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  ) : (
                    <MarkdownRenderer content={m.content} />
                  )}
                </div>
                {m.role === "user" && <div className="w-12 h-12 rounded-lg bg-[#111] border border-white/10 flex items-center justify-center shrink-0 shadow-2xl"><User className="w-6 h-6 text-white/40" /></div>}
              </div>
            )}
            {uploading && (
              <div className="flex gap-6 animate-pulse">
                <div className="w-12 h-12 rounded-lg bg-orange-500/5 border border-orange-500/10 flex items-center justify-center"><Loader2 className="w-6 h-6 text-orange-500 animate-spin" /></div>
                <div className="flex gap-2 items-center font-mono text-[10px] uppercase text-white/20 tracking-widest">Registering Assets...</div>
              </div>
            )}
            {isLoading && !uploading && messages.length > 0 && !messages[messages.length - 1]?.content?.trim() && (
              <div className="flex gap-6 animate-pulse">
                <div className="w-12 h-12 rounded-lg bg-orange-500/5 border border-orange-500/10 flex items-center justify-center"><Loader2 className="w-6 h-6 text-orange-500 animate-spin" /></div>
                <div className="flex gap-2 items-center font-mono text-[10px] uppercase text-white/20 tracking-widest">Synthesizing...</div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </div>

        <footer className="absolute bottom-0 left-0 right-0 p-10 pb-14 bg-gradient-to-t from-black via-black/90 to-transparent z-30">
          <div className="max-w-3xl mx-auto relative group">
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4 animate-in slide-in-from-bottom-2">
                {attachedFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 bg-orange-500/10 border border-orange-500/30 rounded-md text-xs text-orange-500 group/file">
                    <FileIcon className="w-3 h-3" />
                    <span className="truncate max-w-[150px]">{f.path}</span>
                    <button onClick={() => setAttachedFiles(prev => prev.filter((_, idx) => idx !== i))} className="hover:text-white transition-colors"><X className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-stretch gap-3">
              <textarea className="input-scrollbar flex-1 px-5 py-4 h-24 overflow-y-auto resize-none bg-[#111]/80 backdrop-blur-2xl border-2 border-orange-500/25 focus:border-orange-500/50 rounded-lg outline-none transition-all text-white shadow-2xl placeholder:text-white/10 text-[15px] leading-relaxed align-top" placeholder="请输入指令... (Shift+Enter 换行)" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!isLoading) handleSend(); } }} rows={2} />
              <input type="file" ref={fileInputRef} multiple className="hidden" onChange={(e) => { const files = Array.from(e.target.files || []).map(f => ({ file: f, path: f.webkitRelativePath || f.name })); setAttachedFiles(prev => [...prev, ...files]); }} />
              <div className="flex flex-col gap-2 shrink-0">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="w-11 h-11 rounded-md bg-white/10 border border-white/20 text-orange-500 hover:bg-orange-500/20 hover:border-orange-500/30 flex items-center justify-center transition-colors" title="添加附件"><Paperclip className="w-5 h-5" /></button>
                {isLoading && !uploading ? (
                  <button type="button" onClick={handleStop} className="w-11 h-11 bg-red-500/90 text-white rounded-md hover:bg-red-500 active:scale-95 transition-all flex items-center justify-center" title="停止"><Square className="w-5 h-5 fill-current" /></button>
                ) : (
                  <button type="button" onClick={handleSend} disabled={isLoading || uploading} className="w-11 h-11 bg-orange-500 text-black rounded-md hover:bg-orange-400 active:scale-95 transition-all flex items-center justify-center disabled:opacity-40" title="发送（Enter）"><Send className="w-5 h-5" /></button>
                )}
              </div>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
