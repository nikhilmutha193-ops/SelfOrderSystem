import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import type { KotCategoryGroup, MenuCategory } from "../lib/types";
import { api } from "../shared/api/client";
import { Button, IconButton } from "../shared/ui/ui";

const NO_GROUPS: KotCategoryGroup[] = [];

/**
 * With "a separate ticket for each category" on, categories ticked in the same group print on one ticket.
 * Any category that is in no group keeps its own ticket.
 */
export function KotCategoryGroups({
  groups = NO_GROUPS,
  onChange,
}: {
  groups?: KotCategoryGroup[];
  onChange: (groups: KotCategoryGroup[]) => void;
}) {
  const [categories, setCategories] = useState<{ _id: string; name: string }[]>(
    [],
  );

  useEffect(() => {
    let cancelled = false;
    api
      .get<MenuCategory[]>("/menu")
      .then((res) => {
        if (!cancelled)
          setCategories(res.data.map((c) => ({ _id: c._id, name: c.name })));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const taken = new Set(groups.flatMap((g) => g.categoryIds));

  function toggle(groupIndex: number, id: string) {
    onChange(
      groups.map((g, i) =>
        i !== groupIndex
          ? g
          : {
              categoryIds: g.categoryIds.includes(id)
                ? g.categoryIds.filter((c) => c !== id)
                : [...g.categoryIds, id],
            },
      ),
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200 p-3">
      <p className="text-sm font-medium text-slate-900">
        Merge categories on one ticket
      </p>
      <p className="mt-0.5 text-xs text-slate-500">
        Tick two or more categories to print them together, for example Starters
        and Drinks. A category in no group keeps its own ticket. A group with
        fewer than two categories is not saved.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {groups.map((group, groupIndex) => (
          <div key={groupIndex} className="rounded-lg bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Ticket {groupIndex + 1}
              </span>
              <IconButton
                icon={Trash2}
                size="sm"
                label={`Remove group ${groupIndex + 1}`}
                className="!text-red-600 hover:!bg-red-50"
                onClick={() =>
                  onChange(groups.filter((_, i) => i !== groupIndex))
                }
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => {
                const inThis = group.categoryIds.includes(category._id);
                const elsewhere = !inThis && taken.has(category._id);
                return (
                  <label
                    key={category._id}
                    className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${
                      inThis
                        ? "border-orange-400 bg-orange-50 text-orange-800"
                        : "border-slate-300 bg-white text-slate-700"
                    } ${elsewhere ? "cursor-not-allowed opacity-40" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={inThis}
                      disabled={elsewhere}
                      onChange={() => toggle(groupIndex, category._id)}
                    />
                    {category.name}
                  </label>
                );
              })}
              {categories.length === 0 && (
                <span className="text-sm text-slate-500">
                  No categories on the menu yet.
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        icon={Plus}
        className="mt-3"
        disabled={groups.length >= 10}
        onClick={() => onChange([...groups, { categoryIds: [] }])}
      >
        Merge categories
      </Button>
    </div>
  );
}
