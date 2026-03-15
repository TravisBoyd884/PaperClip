"use client";

import { useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, X, Bot } from "lucide-react";
import { toast } from "sonner";
import { updateAgentConfig, type AgentPreferencesPayload } from "./actions";

const FRAMEWORKS = [
  { value: "claude", label: "Claude (Anthropic)" },
  { value: "openai", label: "GPT (OpenAI)" },
  { value: "gemini", label: "Gemini (Google)" },
  { value: "groq", label: "Llama (Groq)" },
];

const MODEL_OPTIONS: Record<string, { swipe: { value: string; label: string }[]; chat: { value: string; label: string }[] }> = {
  claude: {
    swipe: [
      { value: "claude-haiku-4-20250514", label: "Claude Haiku 4 (cheapest)" },
      { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    ],
    chat: [
      { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
      { value: "claude-haiku-4-20250514", label: "Claude Haiku 4 (cheaper)" },
    ],
  },
  openai: {
    swipe: [
      { value: "gpt-4o-mini", label: "GPT-4o Mini (cheapest)" },
      { value: "gpt-4o", label: "GPT-4o" },
    ],
    chat: [
      { value: "gpt-4o", label: "GPT-4o" },
      { value: "gpt-4o-mini", label: "GPT-4o Mini (cheaper)" },
    ],
  },
  gemini: {
    swipe: [
      { value: "gemini-2.0-flash-lite", label: "Gemini Flash Lite (cheapest)" },
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    ],
    chat: [
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { value: "gemini-2.0-flash-lite", label: "Gemini Flash Lite (cheaper)" },
    ],
  },
  groq: {
    swipe: [
      { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B (cheapest)" },
      { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
    ],
    chat: [
      { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
      { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B (cheaper)" },
    ],
  },
};

interface AgentConfigFormProps {
  initialIsAgent: boolean;
  initialFramework: string | null;
  initialDescription: string | null;
  initialPreferences: AgentPreferencesPayload | null;
}

function TagInput({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault();
      const value = input.trim().replace(/,$/,"");
      if (value && !tags.includes(value)) {
        onChange([...tags, value]);
      }
      setInput("");
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  function removeTag(index: number) {
    onChange(tags.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-wrap gap-1.5 rounded-md border border-input bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
      {tags.map((tag, i) => (
        <Badge key={i} variant="secondary" className="gap-1 pr-1">
          {tag}
          <button
            type="button"
            onClick={() => removeTag(i)}
            className="rounded-full p-0.5 hover:bg-muted-foreground/20"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? placeholder : ""}
        className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

export function AgentConfigForm({
  initialIsAgent,
  initialFramework,
  initialDescription,
  initialPreferences,
}: AgentConfigFormProps) {
  const [isAgent, setIsAgent] = useState(initialIsAgent);
  const [framework, setFramework] = useState(initialFramework ?? "claude");
  const [description, setDescription] = useState(initialDescription ?? "");
  const [personality, setPersonality] = useState(
    initialPreferences?.personality ?? ""
  );
  const [wants, setWants] = useState<string[]>(
    initialPreferences?.wants ?? []
  );
  const [willingToTrade, setWillingToTrade] = useState<string[]>(
    initialPreferences?.willing_to_trade ?? []
  );
  const [swipeModel, setSwipeModel] = useState(
    initialPreferences?.swipe_model ?? ""
  );
  const [chatModel, setChatModel] = useState(
    initialPreferences?.chat_model ?? ""
  );
  const [saving, setSaving] = useState(false);

  const models = MODEL_OPTIONS[framework] ?? MODEL_OPTIONS.claude;

  function handleFrameworkChange(value: string) {
    setFramework(value);
    const newModels = MODEL_OPTIONS[value];
    if (newModels) {
      setSwipeModel(newModels.swipe[0].value);
      setChatModel(newModels.chat[0].value);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const preferences: AgentPreferencesPayload = {
        wants,
        willing_to_trade: willingToTrade,
        personality,
        swipe_model: swipeModel || models.swipe[0].value,
        chat_model: chatModel || models.chat[0].value,
      };

      const result = await updateAgentConfig(
        isAgent,
        framework,
        description,
        preferences
      );

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Agent configuration saved");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          AI Agent
        </CardTitle>
        <CardDescription>
          Configure an AI agent to trade on your behalf.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={isAgent}
              onClick={() => setIsAgent(!isAgent)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${isAgent ? "bg-primary" : "bg-input"}`}
            >
              <span
                className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${isAgent ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
            <Label className="cursor-pointer" onClick={() => setIsAgent(!isAgent)}>
              Enable AI Agent
            </Label>
          </div>

          {isAgent && (
            <div className="space-y-6 animate-in fade-in-0 slide-in-from-top-2 duration-200">
              <div className="space-y-2">
                <Label>Framework</Label>
                <Select value={framework} onValueChange={handleFrameworkChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FRAMEWORKS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="agent-description">Agent Description</Label>
                <Textarea
                  id="agent-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="A brief description of what this agent does..."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="personality">Personality</Label>
                <Textarea
                  id="personality"
                  value={personality}
                  onChange={(e) => setPersonality(e.target.value)}
                  placeholder="Passionate Pokemon card collector who values holographic base set cards..."
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Describes how your agent behaves in chat and makes trading decisions.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Wants</Label>
                <TagInput
                  tags={wants}
                  onChange={setWants}
                  placeholder="e.g. pokemon cards, vintage electronics"
                />
                <p className="text-xs text-muted-foreground">
                  Categories your agent will actively seek. Press Enter or comma to add.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Willing to Trade</Label>
                <TagInput
                  tags={willingToTrade}
                  onChange={setWillingToTrade}
                  placeholder="e.g. MTG cards, sports memorabilia"
                />
                <p className="text-xs text-muted-foreground">
                  Categories your agent is happy to trade away.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Swipe / Trade Model</Label>
                  <Select
                    value={swipeModel || models.swipe[0].value}
                    onValueChange={setSwipeModel}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {models.swipe.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Cheaper model for quick yes/no decisions.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Chat Model</Label>
                  <Select
                    value={chatModel || models.chat[0].value}
                    onValueChange={setChatModel}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {models.chat.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Smarter model for generating messages.
                  </p>
                </div>
              </div>

              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Agent Config"
                )}
              </Button>
            </div>
          )}

          {!isAgent && (
            <p className="text-sm text-muted-foreground">
              Enable the AI agent to configure automated trading preferences.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
