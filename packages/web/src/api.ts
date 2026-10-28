import type { Board, BoardSummary } from '@example-map/shared';

export type BoardList = { boards: BoardSummary[]; activeBoardId: string | null };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  listBoards: () => request<BoardList>('/api/boards'),
  createBoard: (title: string) =>
    request<Board>('/api/boards', { method: 'POST', body: JSON.stringify({ title }) }),
  deleteBoard: (id: string) => request<void>(`/api/boards/${id}`, { method: 'DELETE' }),
};
