"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createIntake, uploadPhoto } from "./actions";

const CONDITIONS = [
  { value: "new", label: "New" },
  { value: "like_new", label: "Like New" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
];

const CATEGORIES = [
  { value: "office", label: "Office" },
  { value: "electronics", label: "Electronics" },
  { value: "furniture", label: "Furniture" },
  { value: "collectible", label: "Collectible" },
  { value: "other", label: "Other" },
];

export function IntakeForm() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photos, setPhotos] = useState<{ url: string; name: string }[]>([]);
  const [condition, setCondition] = useState("");
  const [category, setCategory] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`${file.name} exceeds 5MB limit`);
          continue;
        }

        const formData = new FormData();
        formData.set("file", file);
        const result = await uploadPhoto(formData);

        if (result.error) {
          toast.error(`Failed to upload ${file.name}: ${result.error}`);
        } else if (result.url) {
          setPhotos((prev) => [...prev, { url: result.url!, name: file.name }]);
        }
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    try {
      const form = e.currentTarget;
      const formData = new FormData(form);
      formData.set("condition", condition);
      formData.set("category", category);
      for (const photo of photos) {
        formData.append("photoUrls", photo.url);
      }

      const result = await createIntake(formData);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Intake created! Your shipping label is ready.");
      setOpen(false);
      setPhotos([]);
      setCondition("");
      setCategory("");
      form.reset();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Intake
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send in an Item</DialogTitle>
          <DialogDescription>
            Describe the item you want to trade. We&apos;ll assign a warehouse
            and generate a shipping label for you.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Item Name</Label>
            <Input
              id="name"
              name="name"
              placeholder="e.g. Red paperclip"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Describe your item in detail..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Condition</Label>
              <Select value={condition} onValueChange={setCondition} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="estimatedValue">Estimated Value ($)</Label>
            <Input
              id="estimatedValue"
              name="estimatedValue"
              type="number"
              step="0.01"
              min="0"
              placeholder="Optional"
            />
            <p className="text-xs text-muted-foreground">
              How much do you think this item is worth? Used for sorting and filtering.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Photos</Label>
            <div className="flex flex-wrap gap-2">
              {photos.map((photo, i) => (
                <div
                  key={i}
                  className="group relative h-20 w-20 overflow-hidden rounded-xl border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.name}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="h-4 w-4 text-white" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex h-20 w-20 items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 transition-colors"
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  <Upload className="h-5 w-5 text-muted-foreground" />
                )}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePhotoUpload}
            />
            <p className="text-xs text-muted-foreground">
              Upload up to 5 photos. Max 5MB each.
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={loading || !condition}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Intake"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
