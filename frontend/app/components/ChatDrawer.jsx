import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Send, MessageSquare, Loader2, ArrowUp } from "lucide-react";
import { sendMessage, getMessages } from "../../api/messageApi";

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
    setLoading(true);
    setPollingDisabled(false);
    try {
      const data = await getMessages(projectId, token, 1, 20);
      setMessages(data.messages);
      setPagination(data.pagination);
      setTimeout(() => scrollToBottom("auto"), 100);
    } catch (err) {
      toast.error(err.message || "Failed to load messages");
      if (err.status === 400 || err.status === 403) {
        setPollingDisabled(true);
        onClose();
      }
    } finally {
      setLoading(false);
    }
  };

  // Poll for new messages
  const pollMessages = async () => {
    if (!token || !projectId || !open || loading || sending || pollingDisabled) return;
    try {
      const fetchLimit = Math.max(20, pagination.page * 20);
      const data = await getMessages(projectId, token, 1, fetchLimit);
      setMessages(data.messages);
      setPagination(prev => ({
        ...data.pagination,
        page: Math.ceil(data.messages.length / 20) || 1
      }));
    } catch (err) {
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
    const nextPage = pagination.page + 1;
    try {
      const data = await getMessages(projectId, token, nextPage, 20);
      
      // Store current scroll height
      const container = scrollContainerRef.current;
      const prevScrollHeight = container ? container.scrollHeight : 0;

      // Update state
      setMessages((prev) => [...data.messages, ...prev]);
      setPagination(data.pagination);

      // Restore scroll position so user doesn't jump
      setTimeout(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevScrollHeight;
        }
      }, 50);
    } catch (err) {
      toast.error(err.message || "Failed to load older messages");
    }
  };

  // Send message
  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || sending || !projectId) return;

    setSending(true);
    const content = inputText.trim();
    setInputText("");

    try {
      const newMessage = await sendMessage(projectId, content, token);
      setMessages((prev) => [...prev, newMessage]);
      setTimeout(() => scrollToBottom("smooth"), 50);
    } catch (err) {
      toast.error(err.message || "Failed to send message");
      setInputText(content); // Restore input in case of failure
    } finally {
      setSending(false);
    }
  };

  // Load initial messages on open
  useEffect(() => {
    if (open) {
      fetchMessages();
    } else {
      setMessages([]);
    }
  }, [open, projectId]);

  // Set up polling interval every 5 seconds
  useEffect(() => {
    let intervalId;
    if (open && projectId && token && !pollingDisabled) {
      intervalId = setInterval(pollMessages, 5000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [open, projectId, token, pagination.page, pollingDisabled]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md bg-background flex flex-col h-full p-0">
        <SheetHeader className="p-4 border-b border-border">
          <div className="flex items-center gap-2 text-[var(--brand-gold)]">
            <MessageSquare className="size-4" />
            <span className="eyebrow">Project Chat</span>
          </div>
          <SheetTitle className="font-serif text-lg truncate">{projectTitle}</SheetTitle>
          <SheetDescription className="truncate">
            Conversation between Client and Student
          </SheetDescription>
        </SheetHeader>

        {/* Message Stream Area */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto p-4 space-y-3"
          style={{ minHeight: 0 }}
        >
          {loading && messages.length === 0 ? (
            <div className="py-20 text-center text-sm text-muted-foreground animate-pulse font-serif">
              Opening chat history...
            </div>
          ) : (
            <>
              {/* Load More Button */}
              {pagination.page < pagination.pages && (
                <div className="text-center py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-[var(--brand-gold)] hover:text-[var(--brand-gold)]/80 hover:bg-muted"
                    onClick={handleLoadMore}
                  >
                    <ArrowUp className="size-3 mr-1" /> Load older messages
                  </Button>
                </div>
              )}

              {messages.length === 0 ? (
                <div className="py-20 text-center text-xs text-muted-foreground italic">
                  No messages yet. Send a message to start communicating!
                </div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.senderId?._id === currentUser?._id;
                  return (
                    <div
                      key={msg._id}
                      className={`flex gap-2.5 max-w-[85%] ${
                        isMe ? "ml-auto flex-row-reverse" : "mr-auto"
                      }`}
                    >
                      {/* Avatar */}
                      <div className="size-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground overflow-hidden flex-shrink-0 border border-border">
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
                          className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                            isMe
                              ? "bg-[var(--brand-gold)] text-[var(--brand-deep)] rounded-tr-none font-medium"
                              : "bg-card border border-border/80 rounded-tl-none text-foreground"
                          }`}
                        >
                          {msg.content}
                        </div>
                        <div
                          className={`flex items-center gap-1.5 text-[10px] text-muted-foreground ${
                            isMe ? "justify-end" : "justify-start"
                          }`}
                        >
                          <span className="font-semibold capitalize text-[9px] bg-muted px-1.5 py-0.5 rounded">
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
        <form onSubmit={handleSend} className="p-4 border-t border-border bg-card flex gap-2">
          <input
            type="text"
            placeholder="Type a message..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={sending}
            className="flex-1 min-w-0 rounded-xl bg-background border border-border px-3.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand-gold)] disabled:opacity-75"
          />
          <Button
            type="submit"
            size="icon"
            disabled={sending || !inputText.trim()}
            className="bg-[var(--brand-gold)] text-[var(--brand-deep)] hover:bg-[var(--brand-gold)]/90 rounded-xl flex-shrink-0"
          >
            {sending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
