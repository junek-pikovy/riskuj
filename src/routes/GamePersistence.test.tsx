import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../../server/index";
import GameEditor, { createEmptyGame, normalizeGame, prepareGameForSave } from "../components/admin/GameEditor";
import { gamesClient } from "../api/gamesClient";
import { parseGameJson, serializeGameToJson } from "../importExport/gameJson";
import type { Game } from "../types/game";
import PlayPage from "./PlayPage";
import AdminPage from "./AdminPage";

function fixture(): Game {
  return prepareGameForSave(normalizeGame({
    id: "regression-game",
    title: "Anonymous quiz",
    teams: [{ id: "team-a", name: "Team A" }],
    rounds: [],
    categories: [{ id: "category-a", title: "Category A" }],
    questions: [{ id: "question-a", categoryId: "category-a", points: 1000, prompt: "Question A", answer: "Answer A" }],
    listeningGenres: [{ id: "pop", title: "pop" }],
    listeningItems: [{ id: "track-a", genreId: "pop", categoryId: "pop", title: "Track A", trackTitle: "Track A", trackTitleAnswer: "Track A", artist: "Artist A", artistAnswer: "Artist A", prompt: "Prompt A", answer: "Answer A" }],
    commonDenominator: { answer: "Common A", clues: [{ id: "clue-a", text: "Clue A" }] }
  }));
}

function edit(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function openListeningEditor() {
  fireEvent.click(screen.getByRole("tab", { name: "2. kolo" }));
}

async function showListeningAnswer(game: Game, genre: string) {
  render(<PlayPage gameId={game.id} />);
  fireEvent.click(await screen.findByRole("tab", { name: "2" }));
  const tile = screen.getByRole("button", { name: `${genre}: poslech` });
  fireEvent.click(tile);
  fireEvent.click(tile);
  fireEvent.click(screen.getByRole("button", { name: "Zobrazit odpověď" }));
}

describe("editor → API persistence → presenter", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "riskuj-regression-"));
    const app = createServer({ gamesDirectory: join(directory, "games"), uploadsDir: join(directory, "uploads"), audioAssetsPath: join(directory, "audio.json") });
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method !== "GET" && method !== "PUT") {
        throw new Error(`Unsupported test fetch method: ${method}`);
      }
      const response = method === "PUT"
        ? await request(app).put(String(url)).send(JSON.parse(String(init?.body)))
        : await request(app).get(String(url));
      return Response.json(response.body, { status: response.status });
    }));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await rm(directory, { recursive: true, force: true });
  });

  it("persists edits to all rounds and displays current listening text after repeated saves", async () => {
    let game = await gamesClient.saveGame(fixture());
    for (const suffix of ["B", "C"]) {
      const onSave = vi.fn(async (game: Game) => { await gamesClient.saveGame(game); });
      const view = render(<GameEditor initialGame={game} onSave={onSave} />);
      fireEvent.click(screen.getByRole("tab", { name: "1. kolo" }));
      edit("Zadání otázky 1000 bodů v kategorii Category A", `Question ${suffix}`);
      edit("Odpověď otázky 1000 bodů v kategorii Category A", `Answer ${suffix}`);
      openListeningEditor();
      edit(`Název: ${suffix === "B" ? "pop" : "Genre B"}`, `Genre ${suffix}`);
      edit("Interpret", `Artist ${suffix}`);
      edit("Název skladby", `Track ${suffix}`);
      edit("Zadání poslechové položky", `Prompt ${suffix}`);
      edit("Odpověď poslechové položky", `Custom answer ${suffix}`);
      fireEvent.click(screen.getByRole("tab", { name: "3. kolo" }));
      edit("Správná odpověď", `Common ${suffix}`);
      edit("Clues", `Clue ${suffix}`);
      fireEvent.click(screen.getByRole("button", { name: "Uložit hru" }));
      await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
      await onSave.mock.results[0].value;
      view.unmount();
      game = await gamesClient.loadGame(game.id);
      const listening = game.rounds.find((round) => round.type === "listening")!;
      expect(listening.items?.[0]).toMatchObject({ artistAnswer: `Artist ${suffix}`, trackTitleAnswer: `Track ${suffix}`, answer: `Custom answer ${suffix}` });
      expect(listening.genres).toEqual(listening.categories);
      expect(game.rounds.find((round) => round.type === "question")?.items?.[0]).toMatchObject({ prompt: `Question ${suffix}`, answer: `Answer ${suffix}` });
      expect(game.rounds.find((round) => round.type === "common-denominator")?.items?.[0]).toMatchObject({ answer: `Common ${suffix}`, clues: [expect.objectContaining({ text: `Clue ${suffix}` })] });
    }
    await showListeningAnswer(game, "Genre C");
    expect(screen.getByText("Prompt C")).toBeInTheDocument();
    expect(screen.getByText("Interpret: Artist C")).toBeInTheDocument();
    expect(screen.getByText("Název: Track C")).toBeInTheDocument();
    expect(screen.getByText("Custom answer C")).toBeInTheDocument();
  });

  it("fills an intentionally unseeded new game and reloads its listening item", async () => {
    const empty = normalizeGame(createEmptyGame());
    expect(empty.listeningItems).toEqual([]);
    // Supply valid anonymous content for the other two rounds.
    const source = fixture();
    const onSave = vi.fn(async (game: Game) => { await gamesClient.saveGame(game); });
    const view = render(<GameEditor initialGame={{ ...empty, categories: source.categories, questions: source.questions, commonDenominator: source.commonDenominator }} onSave={onSave} />);
    openListeningEditor();
    edit("Žánr / sloupec", "pop");
    fireEvent.click(screen.getByRole("button", { name: "Přidat poslechovou položku" }));
    edit("Interpret", "Artist New");
    edit("Název skladby", "Track New");
    fireEvent.click(screen.getByRole("button", { name: "Uložit hru" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    await onSave.mock.results[0].value;
    view.unmount();
    const game = await gamesClient.loadGame(empty.id);
    await showListeningAnswer(game, "pop");
    expect(screen.getByText("Interpret: Artist New")).toBeInTheDocument();
    expect(screen.getByText("Název: Track New")).toBeInTheDocument();
  });

  it("deletes a genre, saves, and re-adds the same name with a new item", async () => {
    let game = await gamesClient.saveGame(fixture());
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let onSave = vi.fn(async (game: Game) => { await gamesClient.saveGame(game); });
    let view = render(<GameEditor initialGame={game} onSave={onSave} />);
    openListeningEditor();
    const genres = screen.getByRole("heading", { name: "Žánry poslechového kola" }).closest("section")!;
    fireEvent.click(within(genres).getByRole("button", { name: "Smazat" }));
    fireEvent.click(screen.getByRole("button", { name: "Uložit hru" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    await onSave.mock.results[0].value;
    view.unmount();
    game = await gamesClient.loadGame(game.id);
    expect(game.rounds.find((round) => round.type === "listening")?.items).toEqual([]);
    onSave = vi.fn(async (game: Game) => { await gamesClient.saveGame(game); });
    view = render(<GameEditor initialGame={game} onSave={onSave} />);
    openListeningEditor();
    fireEvent.click(screen.getByRole("button", { name: "Přidat žánr" }));
    edit("Název: Nový žánr", "pop");
    fireEvent.click(screen.getByRole("button", { name: "Přidat poslechovou položku" }));
    edit("Interpret", "Artist Restored");
    edit("Název skladby", "Track Restored");
    fireEvent.click(screen.getByRole("button", { name: "Uložit hru" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    await onSave.mock.results[0].value;
    view.unmount();
    game = await gamesClient.loadGame(game.id);
    const round = game.rounds.find((candidate) => candidate.type === "listening")!;
    expect(round.categories[0].id).not.toBe("pop");
    expect(round.genres).toEqual(round.categories);
    await showListeningAnswer(game, "pop");
    expect(screen.getByText("Interpret: Artist Restored")).toBeInTheDocument();
  });

  it("moves a legacy category-only track to another genre and deletes the old genre", async () => {
    const source = fixture();
    const round = source.rounds.find((candidate) => candidate.type === "listening")!;
    round.categories.push({ id: "genre-b", title: "Genre B" });
    delete round.genres;
    delete round.items;
    delete round.tracks[0].genreId;
    delete round.tracks[0].title;
    delete round.tracks[0].artist;
    delete source.listeningGenres;
    delete source.listeningItems;
    const game = await gamesClient.saveGame(source);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onSave = vi.fn(async (game: Game) => { await gamesClient.saveGame(game); });
    const view = render(<GameEditor initialGame={game} onSave={onSave} />);
    openListeningEditor();
    expect(screen.getByLabelText("Interpret")).toHaveValue("Artist A");
    expect(screen.getByLabelText("Název skladby")).toHaveValue("Track A");
    edit("Žánr poslechové položky", "genre-b");
    const genres = screen.getByRole("heading", { name: "Žánry poslechového kola" }).closest("section")!;
    fireEvent.click(within(genres).getAllByRole("button", { name: "Smazat" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Uložit hru" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    await onSave.mock.results[0].value;
    view.unmount();
    const loaded = await gamesClient.loadGame(game.id);
    const savedRound = loaded.rounds.find((candidate) => candidate.type === "listening")!;
    expect(savedRound.tracks[0]).toMatchObject({ genreId: "genre-b", categoryId: "genre-b" });
    expect(loaded.listeningItems).toEqual(savedRound.items);
    await showListeningAnswer(loaded, "Genre B");
    expect(screen.getByText("Název: Track A")).toBeInTheDocument();
  });

  it("duplicates a saved game under a new ID without overwriting its content", async () => {
    const original = await gamesClient.saveGame(fixture());
    render(<AdminPage />);
    await waitFor(() => expect(screen.getByLabelText("Název hry")).toHaveValue(original.title));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    edit("Název hry", "Unsaved title");
    fireEvent.click(screen.getByRole("button", { name: "Duplikovat hru" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Neuložené úpravy"));
    expect(screen.getByLabelText("Název hry")).toHaveValue("Unsaved title");
    expect(screen.getByLabelText("Načíst existující hru")).toHaveValue(original.id);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Duplikovat hru" }));
    expect(screen.getByLabelText("Název hry")).toHaveValue(`${original.title} – kopie`);
    expect(screen.getByRole("button", { name: "Spustit novou hru" })).toBeDisabled();
    expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
    edit("Název hry", "Independent copy");
    fireEvent.click(screen.getByRole("tab", { name: "1. kolo" }));
    edit("Zadání otázky 1000 bodů v kategorii Category A", "Copy question");
    fireEvent.click(screen.getByRole("button", { name: "Uložit hru" }));
    await screen.findByText("Hra byla uložená.");
    const id = (screen.getByLabelText("Načíst existující hru") as HTMLSelectElement).value;
    expect(id).not.toBe(original.id);
    const copy = await gamesClient.loadGame(id);
    expect(copy.title).toBe("Independent copy");
    expect(copy.teams).toEqual(original.teams);
    expect(copy.rounds.slice(1)).toEqual(original.rounds.slice(1));
    expect(copy.rounds[0]).toMatchObject({ questions: [expect.objectContaining({ prompt: "Copy question" })] });
    expect(await gamesClient.loadGame(original.id)).toEqual(original);
  });

  it("refreshes generated answers when only artist and title change on the next save", async () => {
    const editable = normalizeGame(fixture());
    editable.listeningItems[0].answer = "";
    const first = await gamesClient.saveGame(prepareGameForSave(editable));
    const next = normalizeGame(await gamesClient.loadGame(first.id));
    next.listeningItems[0].artist = "Artist B";
    next.listeningItems[0].title = "Track B";
    const saved = await gamesClient.saveGame(prepareGameForSave(next));
    expect(saved.listeningItems?.[0].answer).toBe("Artist B - Track B");
    await showListeningAnswer(saved, "pop");
    expect(screen.queryByText("Artist A - Track A")).not.toBeInTheDocument();
  });

  it("preserves a custom answer matching the old generated artist/title text", () => {
    const editable = normalizeGame(fixture());
    editable.listeningItems[0].answer = "Artist A - Track A";
    editable.listeningItems[0].artist = "Artist B";
    editable.listeningItems[0].title = "Track B";
    const saved = prepareGameForSave(editable);
    expect(saved.listeningItems?.[0].answer).toBe("Artist A - Track A");
  });

  it("keeps an explicitly edited generated answer custom even when the text matches", async () => {
    const editable = normalizeGame(fixture());
    editable.listeningItems[0].answer = "";
    const original = await gamesClient.saveGame(prepareGameForSave(editable));
    const onSave = vi.fn(async (game: Game) => { await gamesClient.saveGame(game); });
    const view = render(<GameEditor initialGame={original} onSave={onSave} />);
    openListeningEditor();
    edit("Odpověď poslechové položky", "Temporary custom text");
    edit("Odpověď poslechové položky", "Artist A - Track A");
    edit("Interpret", "Artist B");
    edit("Název skladby", "Track B");
    fireEvent.click(screen.getByRole("button", { name: "Uložit hru" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    await onSave.mock.results[0].value;
    view.unmount();
    const loaded = await gamesClient.loadGame(original.id);
    expect(loaded.listeningItems?.[0].answer).toBe("Artist A - Track A");
    expect(loaded.listeningItems?.[0].generatedAnswer).toBeUndefined();
  });

  it("defaults missing legacy answer and prompt safely and shares normalized item aliases", () => {
    const editable = normalizeGame(fixture());
    // Simulate incomplete legacy data arriving outside the strict JSON importer.
    Reflect.deleteProperty(editable.listeningItems[0], "answer");
    Reflect.deleteProperty(editable.listeningItems[0], "prompt");
    const saved = prepareGameForSave(editable);
    const listening = saved.rounds.find((round) => round.type === "listening")!;
    expect(saved.listeningItems?.[0]).toMatchObject({ answer: "Artist A - Track A", prompt: "Poznej interpreta a název skladby." });
    expect(saved.listeningItems).toBe(listening.items);
    expect(listening.tracks).toBe(listening.items);
    expect(listening.genres).toBe(listening.categories);
    editable.listeningItems[0].answer = "  Custom answer  ";
    expect(prepareGameForSave(editable).listeningItems?.[0].answer).toBe("  Custom answer  ");
  });

  it("rejects unsupported fetch methods instead of silently treating them as GET", async () => {
    await expect(fetch("/api/games", { method: "POST" })).rejects.toThrow("Unsupported test fetch method: POST");
  });

  it("exports, edits, imports into a new ID and persists all three rounds", async () => {
    const original = await gamesClient.saveGame(fixture());
    const payload = JSON.parse(serializeGameToJson(original));
    payload.game.id = "imported-game";
    payload.game.title = "Imported quiz";
    payload.game.listeningGenres[0].title = "Imported genre";
    payload.game.listeningItems[0].artist = "Imported artist";
    payload.game.listeningItems[0].title = "Imported track";
    const parsed = parseGameJson(JSON.stringify(payload));
    const imported = await gamesClient.saveGame(prepareGameForSave(normalizeGame(parsed)));
    const loaded = await gamesClient.loadGame(imported.id);
    expect(loaded.rounds.filter((round) => round.type !== "listening")).toEqual(original.rounds.filter((round) => round.type !== "listening"));
    expect(parseGameJson(serializeGameToJson(loaded)).rounds).toEqual(loaded.rounds);
    await showListeningAnswer(loaded, "Imported genre");
    expect(screen.getByText("Interpret: Imported artist")).toBeInTheDocument();
    expect(screen.getByText("Název: Imported track")).toBeInTheDocument();
    expect((await gamesClient.loadGame(original.id)).rounds).toEqual(original.rounds);
  });
});
