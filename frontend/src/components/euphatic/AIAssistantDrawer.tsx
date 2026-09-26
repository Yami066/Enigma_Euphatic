import { useState, useRef, useEffect } from "react";
import { Bot, Lightbulb, MessageSquare, Send, Sparkles, X } from "lucide-react";
import { useApp } from "../../context/AppContext";
import { CitationBlock } from "./CitationBlock";

export function AIAssistantDrawer() {
  const { assistantOpen, setAssistantOpen, currentView, caseData, lang } = useApp();
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<
    Array<{
      role: "user" | "assistant";
      text: string;
      citation?: string;
      source?: string;
    }>
  >([
    {
      role: "assistant",
      text:
        lang === "hi"
          ? `नमस्ते। मैं आपका Euphatic कानूनी सहायक हूँ। मैं आरबीआई दिशानिर्देश 2025, उत्तराधिकार अधिनियम और दावा प्रक्रियाओं में आपकी सहायता के लिए तैयार हूँ। आप वर्तमान में "${currentView}" स्क्रीन पर हैं।`
          : `Hello. I am your Euphatic Statutory Legal Assistant. I am directly grounded in RBI Directions 2025, the Indian Succession Act, and statutory estate protocols. You are currently viewing the "${currentView}" workspace. How may I assist your family today?`,
      citation:
        "RBI Master Directions 2025 (DOR.RAG.REC.73/09.08.001/2024-25) Para 31: Banks must settle deceased claims within 15 calendar days of receiving full paperwork.",
      source: "RBI Master Directions 2025 Para 31",
    },
  ]);

  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, assistantOpen]);

  if (!assistantOpen) return null;

  const handleSend = (userText?: string) => {
    const textToSend = userText || query;
    if (!textToSend.trim()) return;

    const newMsgs = [...messages, { role: "user" as const, text: textToSend }];
    setMessages(newMsgs);
    setQuery("");

    // Simulate intelligent legal response based on Indian rules
    setTimeout(() => {
      let reply = "";
      let citation = "";
      let source = "";

      const lower = textToSend.toLowerCase();
      if (lower.includes("15") || lower.includes("day") || lower.includes("time") || lower.includes("deadline")) {
        reply =
          "Under Paragraph 31 of RBI Master Directions 2025, banks are statutorily required to settle claims of deceased depositors within 15 calendar days from the date of receiving complete documentation. If there is a delay attributable to the bank beyond 15 days, the bank is legally required to pay penal interest at Bank Rate + 4% p.a. without the claimant having to file a separate request.";
        citation = "RBI Directions 2025 para 31 & 33: Mandatory 15 calendar days settlement window and penal interest at Bank Rate + 4% p.a.";
        source = "RBI Directions 2025 para 31, 33";
      } else if (lower.includes("nominee") || lower.includes("nomination")) {
        reply =
          "Under Section 45ZA to 45ZF of the Banking Regulation Act and RBI Directions 2025 para 28, payment to a registered nominee provides a complete and valid discharge to the bank. Banks cannot insist on a Succession Certificate, Probate, or indemnity bond if a valid nomination is registered.";
        citation = "Banking Regulation Act 1949 & RBI Directions 2025 para 28: Valid discharge upon payment to nominee.";
        source = "BR Act Sec 45ZA; RBI 2025 para 28";
      } else if (lower.includes("locker") || lower.includes("safe")) {
        reply =
          "For safe deposit lockers held by a deceased customer, the bank must allow the nominee or survivors to access the locker and prepare a detailed inventory in their presence alongside two independent witnesses and a bank official. Nothing may be removed until the inventory is signed.";
        citation = "RBI Directions 2025 para 35: Safe Deposit Locker Access & Inventory Process.";
        source = "RBI Directions 2025 para 35";
      } else if (lower.includes("ombudsman") || lower.includes("complaint") || lower.includes("late")) {
        reply =
          "If the bank refuses to settle within 30 days of receiving your complaint or fails to pay statutory penal interest, you can directly escalate to the Reserve Bank - Integrated Ombudsman Scheme (RBI-IOS 2021) via CMS portal (cms.rbi.org.in). Euphatic can auto-generate this complaint draft for your case.";
        citation = "Reserve Bank - Integrated Ombudsman Scheme (RBI-IOS) 2021 Clause 10.";
        source = "RBI-IOS 2021 Clause 10";
      } else {
        reply = `For ${caseData.deceased.fullName}'s estate, all claims in your portfolio are routed through standard RBI Annexures (Annex I-A for nominee, Annex I-B for heirs, Annex I-C family tree affidavit, and Annex I-D for relinquishing heirs). You can review ready-to-sign paperwork directly in the Official Packs tab.`;
        citation = "RBI Master Directions 2025 para 30: Standard Annexure Claim Forms.";
        source = "RBI Directions 2025 para 30";
      }

      setMessages((prev) => [...prev, { role: "assistant", text: reply, citation, source }]);
    }, 450);
  };

  const sampleQuestions = [
    "What is the statutory deadline for bank claim settlement?",
    "Can a bank ask for a Succession Certificate if there is a Nominee?",
    "How is penal interest calculated under RBI Para 33?",
    "What is the procedure for opening a deceased person's locker?",
  ];

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-[#FFFDFB] shadow-modal transition-all animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#EDE9E2] bg-white px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-[8px] bg-[#4F3F38] text-[#FFB077]">
            <Bot className="size-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#4F3F38]">Euphatic Legal AI</h3>
            <span className="font-mono text-xs text-[#8A7F76]">
              Screen: <strong className="text-[#4F3F38]">{currentView}</strong>
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAssistantOpen(false)}
          className="rounded-lg p-2 text-[#8A7F76] hover:bg-[#F5F3EC] hover:text-[#4F3F38]"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[90%] rounded-[12px] p-3.5 text-xs leading-relaxed ${
                m.role === "user"
                  ? "bg-[#FFB077] font-medium text-[#4F3F38]"
                  : "border border-[#EDE9E2] bg-white text-[#4F3F38] shadow-[0_2px_8px_rgba(79,63,56,0.04)]"
              }`}
            >
              <p>{m.text}</p>
            </div>
            {m.citation && (
              <CitationBlock
                citation={m.citation}
                source={m.source}
                className="mt-2 max-w-[90%]"
              />
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Sample Quick Prompts */}
      <div className="border-t border-[#EDE9E2] bg-[#F5F3EC]/40 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-[#8A7F76]">
          <Lightbulb className="size-3.5 text-[#FFB077]" />
          Common Statutory Questions
        </div>
        <div className="flex flex-wrap gap-1.5">
          {sampleQuestions.slice(0, 2).map((q, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSend(q)}
              className="rounded-full border border-[#EDE9E2] bg-white px-2.5 py-1 text-[11px] text-[#4F3F38] hover:border-[#4F3F38]"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-[#EDE9E2] bg-white p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            placeholder="Ask anything about RBI rules, succession, or claims..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="app-input flex-1 text-xs"
          />
          <button type="submit" className="btn-primary-sm shrink-0">
            <Send className="size-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
