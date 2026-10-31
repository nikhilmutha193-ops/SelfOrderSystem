import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { displaysApi, type DisplayInput } from "./api";

const displayKeys = {
  all: ["displays"] as const,
  public: (code: string) => ["displays", "public", code] as const,
};

export function useDisplays() {
  return useQuery({ queryKey: displayKeys.all, queryFn: displaysApi.list });
}

function useDisplayMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: displayKeys.all }),
  });
}

export const useCreateDisplay = () =>
  useDisplayMutation((input: DisplayInput) => displaysApi.create(input));

export const useUpdateDisplay = () =>
  useDisplayMutation(
    ({ id, input }: { id: string; input: Partial<DisplayInput> }) =>
      displaysApi.update(id, input),
  );

export const useRenewDisplay = () =>
  useDisplayMutation((id: string) => displaysApi.renew(id));

export const useDeleteDisplay = () =>
  useDisplayMutation((id: string) => displaysApi.remove(id));

/** A screen re-checks its slideshow every minute, so a change made in the admin reaches it on its own. */
export function usePublicDisplay(code: string) {
  return useQuery({
    queryKey: displayKeys.public(code),
    queryFn: () => displaysApi.publicView(code),
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    retry: false,
  });
}
