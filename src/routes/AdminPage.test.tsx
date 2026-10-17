import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Game } from "../types/game";
import AdminPage from "./AdminPage";

const uploadedAsset = {
  id: "audio-uploaded",
  src: "/uploads/uploaded.mp3",
  title: "Uploaded preview",
  originalName: "uploaded.mp3",
  displayName: "Uploaded preview",
  mimeType: "audio/mpeg"
};

const adminGame: Game = {
  id: "admin-test",
  title: "Admin test",
  teams: [{ id: "team-1", name: "Tým 1" }],
  categories: [{ id: "cat-1", title: "Kategorie" }],
  questions: [
    {
      id: "question-1",
      categoryId: "cat-1",
      points: 1000,
      value: 1000,
      prompt: "Otázka",
      answer: "Odpověď"
    }
  ],
  listeningGenres: [{ id: "genre-1", title: "Žánr" }],
  listeningItems: [
    {
      id: "listen-1",
      genreId: "genre-1",
      categoryId: "genre-1",
      title: "Track",
      artist: "Interpret",
      prompt: "Poznej skladbu",
      answer: "Interpret - Track",
      points: 5000,
      value: 5000
    }
  ],
  commonDenominator: {
    answer: "Jmenovatel",
    clues: [{ id: "clue-1", text: "Indicie", prompt: "Indicie", order: 1 }]
  },
  rounds: [
    {
      id: "round-1",
      type: "question",
      title: "Otázky",
      categories: [{ id: "cat-1", title: "Kategorie" }],
      questions: [
        {
          id: "question-1",
          categoryId: "cat-1",
          points: 1000,
          value: 1000,
          prompt: "Otázka",
          answer: "Odpověď"
        }
      ]
    },
    {
      id: "round-2",
      type: "listening",
      title: "Poslech",
      categories: [{ id: "genre-1", title: "Žánr" }],
      tracks: [
        {
          id: "listen-1",
          genreId: "genre-1",
          categoryId: "genre-1",
          title: "Track",
          artist: "Interpret",
          prompt: "Poznej skladbu",
          answer: "Interpret - Track",
          points: 5000,
          value: 5000
        }
      ]
    },
    {
      id: "round-3",
      type: "common-denominator",
      title: "Společný jmenovatel",
      answer: "Jmenovatel",
      points: 5000,
      clues: [{ id: "clue-1", text: "Indicie", prompt: "Indicie", order: 1 }]
    }
  ],
  createdAt: "2026-05-30T10:00:00.000Z",
  updatedAt: "2026-05-30T10:00:00.000Z"
};

describe("AdminPage", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === "/api/games" && !init) {
          return Response.json([
            {
              id: adminGame.id,
              title: adminGame.title,
              updatedAt: adminGame.updatedAt,
              roundCount: adminGame.rounds.length
            }
          ]);
        }

        if (url === "/api/games/admin-test" && !init) {
          return Response.json(adminGame);
        }

        if (url === "/api/audio-assets" && !init) {
          return Response.json([]);
        }

        if (url === "/api/uploads/audio" && init?.method === "POST") {
          return Response.json(uploadedAsset);
        }

        if (url === "/api/games/admin-test" && init?.method === "PUT") {
          return Response.json(JSON.parse(String(init.body)));
        }

        return new Response("not found", { status: 404 });
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("nahraje audio, připojí ho k položce a uloží hru s neutrálním AudioAsset", async () => {
    render(<AdminPage />);

    expect(await screen.findByLabelText("Editor hry")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "1. kolo" }));

    const fileInput = (await screen.findAllByLabelText("Upload audio"))[0];
    fireEvent.change(fileInput, {
      target: {
        files: [new File(["fake"], "uploaded.mp3", { type: "audio/mpeg" })]
      }
    });

    await waitFor(() => {
      expect(
        screen
          .getAllByLabelText("Náhled audio ukázky")
          .some((audio) => audio.getAttribute("src") === "/uploads/uploaded.mp3")
      ).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "Uložit hru" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/games/admin-test",
        expect.objectContaining({
          method: "PUT",
          headers: { "content-type": "application/json" }
        })
      );
    });

    const saveCall = vi
      .mocked(fetch)
      .mock.calls.find(
        ([url, init]) => url === "/api/games/admin-test" && init?.method === "PUT"
      );
    const savedGame = JSON.parse(String(saveCall?.[1]?.body));
    expect(JSON.stringify(savedGame)).toContain("/uploads/uploaded.mp3");
    expect(JSON.stringify(savedGame)).toContain("originalName");
  });

  it("po uložení znovu načte seznam her a ukáže uložený název v selectu", async () => {
    let saved = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === "/api/games" && !init) {
          return Response.json([
            {
              id: adminGame.id,
              title: saved ? "Přejmenovaná hra" : adminGame.title,
              updatedAt: adminGame.updatedAt,
              roundCount: adminGame.rounds.length
            }
          ]);
        }

        if (url === "/api/games/admin-test" && !init) {
          return Response.json(adminGame);
        }

        if (url === "/api/audio-assets" && !init) {
          return Response.json([]);
        }

        if (url === "/api/games/admin-test" && init?.method === "PUT") {
          saved = true;
          return Response.json({
            ...JSON.parse(String(init.body)),
            title: "Přejmenovaná hra"
          });
        }

        return new Response("not found", { status: 404 });
      })
    );

    render(<AdminPage />);

    await screen.findByLabelText("Editor hry");
    expect(screen.getByLabelText("Počet týmů")).toHaveValue(1);
    fireEvent.change(screen.getByLabelText("Počet týmů"), {
      target: { value: "3" }
    });
    fireEvent.change(await screen.findByDisplayValue("Tým 2"), {
      target: { value: "Bar" }
    });
    fireEvent.change(screen.getByLabelText("Název hry"), {
      target: { value: "Přejmenovaná hra" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Uložit hru" }));

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Přejmenovaná hra" })).toBeInTheDocument();
    });
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/games")).toHaveLength(2);
    const saveCall = vi
      .mocked(fetch)
      .mock.calls.find(([url, init]) => url === "/api/games/admin-test" && init?.method === "PUT");
    const savedGame = JSON.parse(String(saveCall?.[1]?.body));
    expect(savedGame.teams).toHaveLength(3);
    expect(savedGame.teams[1].name).toBe("Bar");
  });

  it("spustí test vybrané uložené hry", async () => {
    const onStartGame = vi.fn();

    render(<AdminPage onStartGame={onStartGame} />);

    await screen.findByLabelText("Editor hry");
    fireEvent.click(screen.getByRole("button", { name: "Spustit novou hru" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onStartGame).toHaveBeenCalledWith("admin-test");
  });

  it("nabídne návrat do rozehrané hry", async () => {
    const onResumeGame = vi.fn();

    render(<AdminPage runningGameId="admin-test" onResumeGame={onResumeGame} />);

    await screen.findByLabelText("Editor hry");
    fireEvent.click(screen.getByRole("button", { name: "Vrátit se do hry" }));

    expect(onResumeGame).toHaveBeenCalledTimes(1);
  });

  it("před spuštěním hry při rozehraném průběhu varuje před novým startem", async () => {
    const onStartGame = vi.fn();

    render(<AdminPage runningGameId="admin-test" onStartGame={onStartGame} />);

    await screen.findByLabelText("Editor hry");
    fireEvent.click(screen.getByRole("button", { name: "Spustit novou hru" }));

    expect(
      screen.getByRole("alertdialog", { name: "Opravdu chcete začít novou hru?" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Návrat" }));
    expect(onStartGame).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Spustit novou hru" }));
    fireEvent.click(screen.getByRole("button", { name: "Ano" }));

    expect(onStartGame).toHaveBeenCalledWith("admin-test");
  });

  it("u nové neuložené hry nechá spuštění testu vypnuté", async () => {
    render(<AdminPage />);

    await screen.findByLabelText("Editor hry");
    fireEvent.click(screen.getByRole("button", { name: "Nová hra" }));

    expect(screen.getByRole("button", { name: "Spustit novou hru" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Duplikovat hru" })).toBeDisabled();
  });
});
