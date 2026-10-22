import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";
import { Button } from "./ui/button";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Send, MessageSquare, Loader2, ArrowUp } from "lucide-react";
import { sendMessage, getMessages } from "../../api/messageApi";
import { BrandState } from "../brand/BrandState";

export function ChatDrawer({ open, onClose, projectId, projectTitle, token, currentUser }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 1,
  });

  const targetRef = useRef("");
  targetRef.current = open ? `${projectId}:${token}` : "";
  const chatEndRef = useRef(null);
  const scrollContainerRef = useRef(null);

  const [pollingDisabled, setPollingDisabled] = useState(false);

  // Helper to format timestamps nicely
  const formatTime = (isoString) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Scroll to bottom
  const scrollToBottom = (behavior = "smooth") => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior });
    }
  };

  // Fetch initial messages
  const fetchMessages = async () => {
    if (!token || !projectId || !open) return;
    const target = targetRef.current;
    setLoading(true);
    setPollingDisabled(false);
    try {
      const data = await getMessages(projectId, token, 1, 20);
      if (targetRef.current !== target) return;
      setMessages(data.messages);
      setPagination(data.pagination);
      setTimeout(() => scrollToBottom("auto"), 100);
    } catch (err) {
      if (targetRef.current !== target) return;
      toast.error(err.message || "Failed to load messages");
      if (err.status === 400 || err.status === 403) {
        setPollingDisabled(true);
        onClose();
      }
    } finally {
      if (targetRef.current === target) setLoading(false);
    }
  };

  // Poll for new messages
  const pollMessages = async () => {
    if (!token || !projectId || !open || loading || sending || pollingDisabled) return;
    const target = targetRef.current;
    try {
      const data = await getMessages(projectId, token, 1, 20);
      if (targetRef.current !== target) return;
      setMessages(prev => Array.from(new Map([...prev, ...data.messages].map(m => [m._id, m])).values()).sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt)));
      setPagination(prev => ({ ...prev, total: data.pagination.total, pages: Math.ceil(data.pagination.total / 20) }));
    } catch (err) {
      if (targetRef.current !== target) return;
      console.error("Polling error:", err);
      if (err.status === 400 || err.status === 403) {
        setPollingDisabled(true);
        toast.error("Chat is no longer active or available.");
        onClose();
      }
    }
  };

  // Load older messages (pagination)
  const handleLoadMore = async () => {
    if (loading || pagination.page >= pagination.pages) return;
    const target = targetRef.current;
    setLoading(true);
    const nextPage = pagination.page + 1;
    try {
      const data = await getMessages(projectId, token, nextPage, 20);
      
      if (targetRef.current !== target) return;
      const container = scrollContainerRef.current;
      const prevScrollHeight = container ? container.scrollHeight : 0;

      setMessages(prev => Array.from(new Map([...data.messages, ...prev].map(m => [m._id, m])).values()));
      setPagination(data.pagination);

      setTimeout(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevScrollHeight;
        }
      }, 50);
    } catch (err) {
      if (targetRef.current !== target) return;
      toast.error(err.message || "Failed to load older messages");
    } finally { if (targetRef.current === target) setLoading(false); }
  };

  // Send message
  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || sending || !projectId) return;

    const target = targetRef.current;
    setSending(true);
    const content = inputText.trim();
    setInputText("");

    try {
      const newMessage = await sendMessage(projectId, content, token);
      if (targetRef.current !== target) return;
      setMessages((prev) => [...prev.filter(m => m._id !== newMessage._id), newMessage]);
      setTimeout(() => scrollToBottom("smooth"), 50);
    } catch (err) {
      if (targetRef.current !== target) return;
      toast.error(err.message || "Failed to send message");
      setInputText(content);
    } finally {
      if (targetRef.current === target) setSending(false);
    }
  };

  useEffect(() => {
    setMessages([]);
    setInputText("");
    setSending(false);
    setPagination({ page: 1, limit: 20, total: 0, pages: 1 });
    if (open) {
      fetchMessages();
    } else {
      setMessages([]);
    }
  }, [open, projectId, token]);

  useEffect(() => {
    let intervalId;
    if (open && projectId && token && !pollingDisabled) {
      intervalId = setInterval(pollMessages, 5000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [open, projectId, token, pagination.page, pollingDisabled, loading, sending]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md bg-card border-l border-border flex flex-col h-full p-0">
        <SheetHeader className="p-4 border-b border-border">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MessageSquare className="size-3.5" />
            <span className="text-xs uppercase tracking-wider font-mono">Workspace Channel</span>
          </div>
          <SheetTitle className="text-base font-semibold tracking-tight text-foreground truncate">{projectTitle}</SheetTitle>
          <SheetDescription className="truncate text-xs text-muted-foreground">
            Direct communication for project milestones
          </SheetDescription>
        </SheetHeader>

        {/* Message Stream Area */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto p-4 space-y-3"
          style={{ minHeight: 0 }}
        >
          {loading && messages.length === 0 ? (
            <div className="py-20 text-center text-xs text-muted-foreground animate-pulse">
              Opening channel history…
            </div>
          ) : (
            <>
              {/* Load More Button */}
              {pagination.page < pagination.pages && (
                <div className="text-center py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground hover:text-foreground rounded-[4px]"
                    onClick={handleLoadMore}
                  >
                    <ArrowUp className="size-3 mr-1" /> Load older messages
                  </Button>
                </div>
              )}

              {messages.length === 0 ? (
                <BrandState
                  name="no-messages"
                  title="No messages yet"
                  description="Send a message to start communicating with your project partner."
                  compact
                />
              ) : (
                messages.map((msg) => {
                  const isMe = (msg.senderId?._id || msg.senderId) === currentUser?._id;
                  return (
                    <div
                      key={msg._id}
                      className={`flex gap-2.5 max-w-[85%] ${
                        isMe ? "ml-auto flex-row-reverse" : "mr-auto"
                      }`}
                    >
                      {/* Avatar */}
                      <div className="size-7 rounded-[4px] bg-secondary flex items-center justify-center text-xs font-medium text-foreground overflow-hidden shrink-0 border border-border">
                        {msg.senderId?.avatarUrl ? (
                          <img
                            src={msg.senderId.avatarUrl}
                            alt={msg.senderId.name}
                            className="size-full object-cover"
                          />
                        ) : (
                          msg.senderId?.name?.charAt(0).toUpperCase() || "?"
                        )}
                      </div>

                      {/* Bubble content */}
                      <div className="space-y-1">
                        <div
                          className={`rounded-[8px] px-3.5 py-2 text-xs leading-relaxed ${
                            isMe
                              ? "bg-primary text-primary-foreground rounded-br-none"
                              : "bg-secondary text-foreground rounded-bl-none border border-border"
                          }`}
                        >
                          {msg.content}
                        </div>
                        <div
                          className={`flex items-center gap-1.5 text-[10px] text-muted-foreground ${
                            isMe ? "justify-end" : "justify-start"
                          }`}
                        >
                          <span className="capitalize text-[9px] bg-secondary px-1 py-0.2 rounded font-mono">
                            {msg.senderId?.role || "user"}
                          </span>
                          <span>{formatTime(msg.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </>
          )}
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSend} className="p-3 border-t border-border bg-card flex gap-2">
          <input
            type="text"
            aria-label="Type a message"
            placeholder="Type a message…"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={sending}
            className="flex-1 min-w-0 rounded-[5px] bg-input-background border border-input px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring disabled:opacity-75"
          />
          <Button
            type="submit"
            size="icon"
            disabled={sending || !inputText.trim()}
            className="size-9 rounded-[5px] bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
          >
            {sending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
