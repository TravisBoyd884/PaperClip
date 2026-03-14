"use client";

import { useState, useMemo } from "react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PackageCheck, Search } from "lucide-react";

type InventoryItem = {
  id: string;
  name: string;
  description: string | null;
  condition: string;
  category: string | null;
  photos: string[];
  created_at: string;
  woos: {
    id: string;
    title: string;
    status: string;
    trade_count: number;
    estimated_value: number | null;
    owner_id: string;
  } | null;
  profiles: { id: string; username: string | null } | null;
};

const CONDITION_LABELS: Record<string, string> = {
  new: "New",
  like_new: "Like New",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

const CATEGORY_LABELS: Record<string, string> = {
  office: "Office",
  electronics: "Electronics",
  furniture: "Furniture",
  collectible: "Collectible",
  other: "Other",
};

export function InventoryTable({ items }: { items: InventoryItem[] }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [conditionFilter, setConditionFilter] = useState("all");

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        !search ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.description?.toLowerCase().includes(search.toLowerCase());
      const matchesCategory =
        categoryFilter === "all" || item.category === categoryFilter;
      const matchesCondition =
        conditionFilter === "all" || item.condition === conditionFilter;
      return matchesSearch && matchesCategory && matchesCondition;
    });
  }, [items, search, categoryFilter, conditionFilter]);

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <PackageCheck className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">No items in inventory</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Process intakes to add items to inventory.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={conditionFilter} onValueChange={setConditionFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Condition" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Conditions</SelectItem>
            {Object.entries(CONDITION_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Woo Status</TableHead>
              <TableHead className="text-right">Trades</TableHead>
              <TableHead className="text-right">Est. Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    {item.photos?.[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.photos[0]}
                        alt={item.name}
                        className="h-10 w-10 rounded object-cover flex-shrink-0"
                      />
                    )}
                    <div>
                      <p className="font-medium text-sm">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="capitalize text-sm">
                  {CATEGORY_LABELS[item.category ?? "other"] ?? item.category}
                </TableCell>
                <TableCell className="text-sm">
                  {CONDITION_LABELS[item.condition] ?? item.condition}
                </TableCell>
                <TableCell className="text-sm">
                  {item.profiles?.username ?? "—"}
                </TableCell>
                <TableCell>
                  {item.woos ? (
                    <Badge
                      variant={
                        item.woos.status === "active"
                          ? "default"
                          : item.woos.status === "burned"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {item.woos.status}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">No Woo</span>
                  )}
                </TableCell>
                <TableCell className="text-right text-sm">
                  {item.woos?.trade_count ?? 0}
                </TableCell>
                <TableCell className="text-right text-sm">
                  {item.woos?.estimated_value != null
                    ? `$${Number(item.woos.estimated_value).toFixed(2)}`
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No items match your filters.
          </div>
        )}
      </Card>
    </div>
  );
}
