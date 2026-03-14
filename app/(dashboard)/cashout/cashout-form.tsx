"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createCashout } from "./actions";

type Woo = {
  id: string;
  title: string;
  images: string[];
  estimated_value: number | null;
};

export function CashoutForm({
  woos,
  preselectedWooId,
}: {
  woos: Woo[];
  preselectedWooId?: string;
}) {
  const hasPreselection = !!preselectedWooId && woos.some((w) => w.id === preselectedWooId);
  const [open, setOpen] = useState(hasPreselection);
  const [loading, setLoading] = useState(false);
  const [selectedWoo, setSelectedWoo] = useState(hasPreselection ? preselectedWooId! : "");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("US");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedWoo) {
      toast.error("Please select a Woo to cash out");
      return;
    }

    setLoading(true);
    const result = await createCashout(selectedWoo, {
      street: street.trim(),
      city: city.trim(),
      state: state.trim(),
      zip: zip.trim(),
      country: country.trim(),
    });
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Cash out requested! We'll ship your item soon.");
    setOpen(false);
    setSelectedWoo("");
    setStreet("");
    setCity("");
    setState("");
    setZip("");
    setCountry("US");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={woos.length === 0}>
          <LogOut className="mr-2 h-4 w-4" />
          Request Cash Out
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cash Out a Woo</DialogTitle>
          <DialogDescription>
            Select a Woo to convert back to its physical item. We&apos;ll ship
            it to the address you provide.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Select Woo</Label>
            <Select value={selectedWoo} onValueChange={setSelectedWoo}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a Woo..." />
              </SelectTrigger>
              <SelectContent>
                {woos.map((woo) => (
                  <SelectItem key={woo.id} value={woo.id}>
                    <div className="flex items-center gap-2">
                      {woo.images?.[0] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={woo.images[0]}
                          alt={woo.title}
                          className="h-6 w-6 rounded object-cover"
                        />
                      )}
                      <span>{woo.title}</span>
                      {woo.estimated_value != null && (
                        <span className="text-muted-foreground text-xs">
                          (${Number(woo.estimated_value).toFixed(2)})
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="street">Street Address</Label>
            <Input
              id="street"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              placeholder="123 Main St"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="San Francisco"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="CA"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="zip">ZIP Code</Label>
              <Input
                id="zip"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                placeholder="94102"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="US"
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={loading || !selectedWoo}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Requesting...
              </>
            ) : (
              "Request Cash Out"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
