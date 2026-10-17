import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import type {
  AudioAsset,
  Category,
  CommonDenominatorItem,
  Game,
  GameSoundEffectKey,
  GameSoundEffects,
  ListeningGenre,
  ListeningItem,
  Question,
  QuestionPoints,
  RoundType
} from "../../types/game";
import CategoryEditor from "./CategoryEditor";
import {
  CommonDenominatorEditor,
  FirstRoundQuestionEditor,
  ListeningItemEditor
} from "./QuestionEditor";
import {
  GameJsonValidationError,
  parseGameJson,
  serializeGameToJson
} from "../../importExport/gameJson";
import TeamSetup from "../game/TeamSetup";
import AudioUploadField from "./AudioUploadField";

const questionPoints: QuestionPoints[] = [100, 200, 300, 400, 500];
const roundTypeOrder: RoundType[] = ["question", "listening", "common-denominator"];

function createDefaultTeams() {
  return Array.from({ length: 6 }, (_, index) => ({
    id: `team-${index + 1}`,
    name: `Tým ${index + 1}`
  }));
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

type EditableGame = Game & {
  categories: Category[];
  questions: Question[];
  listeningGenres: ListeningGenre[];
  listeningItems: ListeningItem[];
  commonDenominator: NonNullable<Game["commonDenominator"]>;
  commonDenominatorItems: CommonDenominatorItem[];
  soundEffects: GameSoundEffects;
};

type AudioEditorProps = {
  audioAssets: AudioAsset[];
  onUploadAudio?: (file: File) => Promise<AudioAsset>;
};

type EditorTab = "settings" | "question" | "listening" | "common-denominator";

const editorTabs: Array<{ id: EditorTab; label: string }> = [
  { id: "settings", label: "Nastavení" },
  { id: "question", label: "1. kolo" },
  { id: "listening", label: "2. kolo" },
  { id: "common-denominator", label: "3. kolo" }
];

const soundEffectLabels: Array<{ key: GameSoundEffectKey; label: string }> = [
  { key: "questionSelected", label: "Označení otázky" },
  { key: "questionOpened", label: "Otevření otázkového dialogu" },
  { key: "answerRevealed", label: "Zobrazení odpovědi" },
  { key: "correctAnswer", label: "Správná odpověď" },
  { key: "wrongAnswer", label: "Špatná odpověď" },
  { key: "placementRevealed", label: "Odhalení umístění" },
  { key: "firstPlaceRevealed", label: "Odhalení 1. místa" }
];

function normalizeSoundEffects(soundEffects?: GameSoundEffects): GameSoundEffects {
  return {
    enabled: soundEffects?.enabled ?? false,
    effects: { ...(soundEffects?.effects ?? {}) }
  };
}

export function normalizeGame(game: Game): EditableGame {
  const questionRound = game.rounds.find((round) => round.type === "question");
  const listeningRound = game.rounds.find((round) => round.type === "listening");
  const commonRound = game.rounds.find((round) => round.type === "common-denominator");
  const categories =
    game.categories ?? (questionRound?.type === "question" ? questionRound.categories : []) ?? [];
  const questions =
    game.questions ??
    (questionRound?.type === "question" ? questionRound.items ?? questionRound.questions : []) ??
    [];
  const listeningGenres =
    game.listeningGenres ??
    (listeningRound?.type === "listening"
      ? listeningRound.genres ?? listeningRound.categories
      : []) ??
    [];
  const listeningItems =
    game.listeningItems ??
    (listeningRound?.type === "listening" ? listeningRound.items ?? listeningRound.tracks : []) ??
    [];
  const commonDenominatorItems =
    commonRound?.type === "common-denominator" && commonRound.items?.length
      ? commonRound.items
      : game.commonDenominator || commonRound
        ? [
          {
            id: "common-denominator-1",
            title: "Společný jmenovatel 1",
            value: (commonRound?.points ?? 5000) as CommonDenominatorItem["value"],
            answer: game.commonDenominator?.answer ?? commonRound?.answer ?? "",
            clues: game.commonDenominator?.clues ?? commonRound?.clues ?? [],
            moderatorNote: commonRound?.moderatorNote
          }
        ]
        : [];

  return {
    ...game,
    teams: game.teams.length > 0 ? game.teams : createDefaultTeams(),
    categories,
    questions,
    listeningGenres,
    listeningItems: listeningItems.map((item) => ({
      ...item,
      genreId: item.genreId ?? item.categoryId,
      title: item.title ?? item.trackTitle ?? item.trackTitleAnswer ?? "",
      artist: item.artist ?? item.artistAnswer ?? ""
    })),
    commonDenominator: game.commonDenominator ?? { answer: "", clues: [] },
    commonDenominatorItems,
    soundEffects: normalizeSoundEffects(game.soundEffects)
  };
}

export function createEmptyGame(): Game {
  const firstCategoryId = makeId("category");
  const firstGenreId = makeId("genre");

  const now = new Date().toISOString();

  return {
    id: makeId("game"),
    title: "Nová hra",
    teams: createDefaultTeams(),
    rounds: [],
    createdAt: now,
    updatedAt: now,
    categories: [{ id: firstCategoryId, title: "Nová kategorie" }],
    questions: questionPoints.map((points) => ({
      id: makeId("question"),
      categoryId: firstCategoryId,
      points,
      prompt: "",
      answer: ""
    })),
    listeningGenres: [{ id: firstGenreId, title: "Nový žánr" }],
    listeningItems: [],
    commonDenominator: {
      answer: "",
      clues: []
    },
    soundEffects: normalizeSoundEffects()
  };
}

export function prepareGameForSave(game: EditableGame): Game {
  const now = new Date().toISOString();
  const questionRound = game.rounds.find((round) => round.type === "question");
  const listeningRound = game.rounds.find((round) => round.type === "listening");
  const commonRound = game.rounds.find((round) => round.type === "common-denominator");
  const roundTypes: RoundType[] =
    game.rounds.length > 0
      ? game.rounds.map((round) => round.type)
      : ["question", "listening", "common-denominator"];
  const rounds = [];
  const listeningItems = normalizeListeningItems(game);

  if (roundTypes.includes("question")) {
    rounds.push({
      id: questionRound?.id ?? "round-otazky",
      type: "question" as const,
      title: questionRound?.title ?? "Riskuj",
      categories: game.categories,
      questions: game.questions,
      items: game.questions
    });
  }

  if (roundTypes.includes("listening")) {
    rounds.push({
      id: listeningRound?.id ?? "round-poslech",
      type: "listening" as const,
      title: listeningRound?.title ?? "Poslechové kolo",
      genres: game.listeningGenres,
      categories: game.listeningGenres,
      tracks: listeningItems,
      items: listeningItems
    });
  }

  if (roundTypes.includes("common-denominator")) {
    rounds.push({
      id: commonRound?.id ?? "round-spolecny-jmenovatel",
      type: "common-denominator" as const,
      title: commonRound?.title ?? "Společný jmenovatel",
      points: commonRound?.points ?? 300,
      answer: game.commonDenominatorItems[0]?.answer ?? game.commonDenominator.answer,
      moderatorNote: commonRound?.moderatorNote,
      clues: (game.commonDenominatorItems[0]?.clues ?? game.commonDenominator.clues).map(
        (clue, index) => ({
          ...clue,
          order: clue.order ?? index + 1,
          prompt: clue.prompt ?? clue.text ?? ""
        })
      ),
      items: game.commonDenominatorItems.map((item) => ({
        ...item,
        clues: item.clues.map((clue, index) => ({
          ...clue,
          order: clue.order ?? index + 1,
          prompt: clue.prompt ?? clue.text ?? ""
        })),
        explanation: item.explanation ?? item.moderatorNote
      }))
    });
  }

  return {
    ...game,
    createdAt: game.createdAt ?? now,
    updatedAt: game.updatedAt ?? now,
    rounds,
    listeningItems
  };
}

export function validateGame(game: EditableGame): string[] {
  const messages: string[] = [];
  const activeRoundTypes =
    game.rounds.length > 0
      ? new Set(game.rounds.map((round) => round.type))
      : new Set<RoundType>(["question", "listening", "common-denominator"]);

  if (!game.title.trim()) {
    messages.push("Název hry nesmí být prázdný.");
  }
  if (activeRoundTypes.has("question") && game.categories.some((category) => !category.title.trim())) {
    messages.push("Název kategorie nesmí být prázdný.");
  }
  if (activeRoundTypes.has("listening") && game.listeningGenres.some((genre) => !genre.title.trim())) {
    messages.push("Název žánru nesmí být prázdný.");
  }
  if (
    activeRoundTypes.has("question") &&
    game.questions.some((question) => !question.prompt.trim() || !question.answer.trim())
  ) {
    messages.push("Otázka musí mít vyplněné zadání i odpověď.");
  }
  if (
    activeRoundTypes.has("listening") &&
    game.listeningItems.some(
      (item) => !(item.artist ?? "").trim() || !(item.title ?? item.trackTitle ?? "").trim()
    )
  ) {
    messages.push("Poslechová položka musí mít vyplněného interpreta i název skladby.");
  }
  if (
    activeRoundTypes.has("common-denominator") &&
    game.commonDenominatorItems.some((item) => !item.title.trim())
  ) {
    messages.push("Položka třetího kola musí mít vyplněný název.");
  }
  if (
    activeRoundTypes.has("common-denominator") &&
    !game.commonDenominator.answer.trim() &&
    game.commonDenominatorItems.length === 0
  ) {
    messages.push("Třetí kolo musí mít vyplněný společný jmenovatel.");
  }
  if (
    activeRoundTypes.has("common-denominator") &&
    game.commonDenominatorItems.some((item) => !item.answer.trim())
  ) {
    messages.push("Každá položka třetího kola musí mít vyplněný společný jmenovatel.");
  }
  if (
    activeRoundTypes.has("common-denominator") &&
    game.commonDenominator.clues.some((clue) => !(clue.text ?? "").trim())
  ) {
    messages.push("Indicie ve třetím kole nesmí být prázdná.");
  }
  if (
    activeRoundTypes.has("common-denominator") &&
    game.commonDenominatorItems.some((item) =>
      item.clues.some((clue) => !(clue.text ?? clue.prompt ?? "").trim())
    )
  ) {
    messages.push("Indicie ve třetím kole nesmí být prázdná.");
  }

  return messages;
}

type GameEditorProps = {
  initialGame: Game;
  audioAssets?: AudioAsset[];
  isSaving?: boolean;
  onUploadAudio?: (file: File) => Promise<AudioAsset>;
  onSave: (game: Game) => void | Promise<void>;
};

export default function GameEditor({
  initialGame,
  audioAssets = [],
  isSaving = false,
  onUploadAudio,
  onSave
}: GameEditorProps) {
  const [game, setGame] = useState(() => normalizeGame(initialGame));
  const [errors, setErrors] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<EditorTab>("settings");

  useEffect(() => {
    setGame(normalizeGame(initialGame));
    setErrors([]);
    setActiveTab("settings");
  }, [initialGame]);

  const questionsByCategory = useMemo(() => {
    return game.categories.map((category) => ({
      category,
      questions: game.questions
        .filter((question) => question.categoryId === category.id)
        .sort((left, right) => left.points - right.points)
    }));
  }, [game.categories, game.questions]);
  const hasAvailableRoundType = roundTypeOrder.some(
    (type) => !game.rounds.some((round) => round.type === type)
  );

  function setSoundEffectsEnabled(enabled: boolean) {
    setGame((current) => ({
      ...current,
      soundEffects: {
        ...current.soundEffects,
        enabled
      }
    }));
  }

  function updateSoundEffect(key: GameSoundEffectKey, audio: AudioAsset | undefined) {
    setGame((current) => {
      const effects = { ...current.soundEffects.effects };

      if (audio) {
        effects[key] = audio;
      } else {
        delete effects[key];
      }

      return {
        ...current,
        soundEffects: {
          ...current.soundEffects,
          effects
        }
      };
    });
  }

  function updateQuestion(nextQuestion: Question) {
    setGame((current) => ({
      ...current,
      questions: current.questions.map((question) =>
        question.id === nextQuestion.id ? nextQuestion : question
      )
    }));
  }

  function updateListeningItem(nextItem: ListeningItem) {
    setGame((current) => ({
      ...current,
      listeningItems: current.listeningItems.map((item) =>
        item.id === nextItem.id ? nextItem : item
      )
    }));
  }

  function updateCommonDenominatorItem(nextItem: CommonDenominatorItem) {
    setGame((current) => ({
      ...current,
      commonDenominatorItems: current.commonDenominatorItems.map((item) =>
        item.id === nextItem.id ? nextItem : item
      ),
      commonDenominator:
        current.commonDenominatorItems[0]?.id === nextItem.id
          ? { answer: nextItem.answer, clues: nextItem.clues }
          : current.commonDenominator
    }));
  }

  function addCategory() {
    const category: Category = { id: makeId("category"), title: "Nová kategorie" };
    const questions: Question[] = questionPoints.map((points) => ({
      id: makeId("question"),
      categoryId: category.id,
      points,
      prompt: "",
      answer: ""
    }));

    setGame((current) => ({
      ...current,
      categories: [...current.categories, category],
      questions: [...current.questions, ...questions]
    }));
  }

  function addGenre(): ListeningGenre {
    const genre = { id: makeId("genre"), title: "Nový žánr" };
    setGame((current) => ({
      ...current,
      listeningGenres: [...current.listeningGenres, genre]
    }));
    return genre;
  }

  function addListeningItem() {
    setGame((current) => {
      const existingGenre = current.listeningGenres[0];
      const genre = existingGenre ?? { id: makeId("genre"), title: "Nový žánr" };
      const nextGenres = existingGenre ? current.listeningGenres : [genre];

      return {
        ...current,
        listeningGenres: nextGenres,
        listeningItems: [
          ...current.listeningItems,
          {
            id: makeId("listen"),
            genreId: genre.id,
            categoryId: genre.id,
            title: "",
            artist: "",
            prompt: "",
            answer: ""
          }
        ]
      };
    });
  }

  function addRound() {
    setGame((current) => {
      const existingTypes = new Set(current.rounds.map((round) => round.type));
      const nextType = roundTypeOrder.find((type) => !existingTypes.has(type));

      if (!nextType) {
        return current;
      }

      return {
        ...current,
        rounds: [...current.rounds, createRoundShell(nextType, current, makeId("round"))]
      };
    });
  }

  function changeRoundType(roundId: string, type: RoundType) {
    setGame((current) => {
      if (current.rounds.some((round) => round.id !== roundId && round.type === type)) {
        return current;
      }

      return {
        ...current,
        rounds: current.rounds.map((round) =>
          round.id === roundId ? createRoundShell(type, current, round.id) : round
        )
      };
    });
  }

  function removeRound(roundId: string) {
    setGame((current) => ({
      ...current,
      rounds: current.rounds.filter((round) => round.id !== roundId)
    }));
  }

  function addCommonDenominatorItem() {
    setGame((current) => {
      const nextNumber = current.commonDenominatorItems.length + 1;
      const item: CommonDenominatorItem = {
        id: makeId("common"),
        title: `Společný jmenovatel ${nextNumber}`,
        value: 5000,
        answer: "",
        clues: [{ id: makeId("clue"), text: "", prompt: "", order: 1 }]
      };

      return {
        ...current,
        commonDenominatorItems: [...current.commonDenominatorItems, item]
      };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationErrors = validateGame(game);
    setErrors(validationErrors);

    if (validationErrors.length > 0) {
      return;
    }

    await onSave(prepareGameForSave(game));
  }

  function handleExportJson() {
    const preparedGame = prepareGameForSave(game);
    const blob = new Blob([serializeGameToJson(preparedGame)], {
      type: "application/json;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slugify(preparedGame.title)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleImportJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const confirmed = window.confirm(
      "Import nahradí aktuálně otevřenou hru a hned ji uloží. Pokračovat?"
    );

    if (!confirmed) {
      return;
    }

    try {
      const importedGame = parseGameJson(await readFileAsText(file));
      const normalizedGame = normalizeGame(importedGame);
      setErrors([]);
      await onSave(prepareGameForSave(normalizedGame));
      setGame(normalizedGame);
    } catch (error) {
      const message =
        error instanceof GameJsonValidationError || error instanceof Error
          ? error.message
          : "Import se nepodařil.";
      setErrors([message]);
    }
  }

  return (
    <form className="editor-form" aria-label="Editor hry" onSubmit={handleSubmit}>
      <nav className="editor-tabs" role="tablist" aria-label="Části editoru">
        {editorTabs.map((tab) => (
          <button
            aria-controls={`editor-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            className="editor-tab-button"
            id={`editor-tab-${tab.id}`}
            key={tab.id}
            role="tab"
            type="button"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {errors.length > 0 ? (
        <div className="form-message form-message-error" role="alert">
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {activeTab === "settings" ? (
        <section
          aria-labelledby="editor-tab-settings"
          className="editor-tab-panel"
          id="editor-panel-settings"
          role="tabpanel"
        >
          <section className="editor-section">
            <div className="section-heading-row">
              <h2>Kola hry</h2>
              <button
                className="button-compact"
                type="button"
                disabled={!hasAvailableRoundType}
                onClick={addRound}
              >
                Přidat kolo
              </button>
            </div>
            {!hasAvailableRoundType ? (
              <p className="muted-text">
                Všechna podporovaná kola jsou přidaná.
              </p>
            ) : null}
            {game.rounds.map((round, index) => (
              <div className="inline-actions round-type-row" key={round.id}>
                <label className="field-stack">
                  <span>Typ kola</span>
                  <select
                    value={round.type}
                    onChange={(event) => changeRoundType(round.id, event.target.value as RoundType)}
                  >
                    {roundTypeOrder.map((type) => (
                      <option
                        disabled={game.rounds.some(
                          (candidate) => candidate.id !== round.id && candidate.type === type
                        )}
                        key={type}
                        value={type}
                      >
                        {roundTypeLabel(type)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  aria-label={`Odebrat kolo ${index + 1}`}
                  className="button-compact"
                  type="button"
                  onClick={() => removeRound(round.id)}
                >
                  Odebrat
                </button>
              </div>
            ))}
          </section>

          <section className="editor-section">
            <div className="section-heading-row">
              <h2>Import a export</h2>
              <div className="inline-actions">
                <button type="button" onClick={handleExportJson}>
                  Exportovat JSON
                </button>
                <label className="button-like">
                  <span>Importovat JSON</span>
                  <input
                    aria-label="Importovat JSON hry"
                    accept="application/json,.json"
                    type="file"
                    onChange={(event) => void handleImportJson(event)}
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="editor-section">
            <h2>Hlavní nastavení</h2>
            <label className="field-stack">
              <span>Název hry</span>
              <input
                value={game.title}
                onChange={(event) =>
                  setGame((current) => ({ ...current, title: event.target.value }))
                }
              />
            </label>

            <TeamSetup
              teams={game.teams}
              onChange={(teams) => setGame((current) => ({ ...current, teams }))}
            />
          </section>

          <section className="editor-section">
            <div className="section-heading-row">
              <h2>Zvukové efekty</h2>
              <label className="checkbox-field">
                <input
                  checked={game.soundEffects.enabled}
                  type="checkbox"
                  onChange={(event) => setSoundEffectsEnabled(event.target.checked)}
                />
                <span>Zapnout efekty pro tuto hru</span>
              </label>
            </div>
            <div className="sound-effect-grid">
              {soundEffectLabels.map((effect) => (
                <AudioUploadField
                  key={effect.key}
                  label={effect.label}
                  audio={game.soundEffects.effects[effect.key]}
                  audioAssets={audioAssets}
                  onChange={(audio) => updateSoundEffect(effect.key, audio)}
                  onUploadAudio={onUploadAudio}
                />
              ))}
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === "question" ? (
        <section
          aria-labelledby="editor-tab-question"
          className="editor-tab-panel"
          id="editor-panel-question"
          role="tabpanel"
        >
          <section className="editor-section">
            <h2>První kolo</h2>
            <CategoryEditor
              title="Kategorie prvního kola"
              addLabel="Přidat kategorii"
              emptyLabel="Zatím nejsou přidané žádné kategorie."
              deleteMessage="Smazáním kategorie se smažou i její otázky. Pokračovat?"
              groups={game.categories}
              onAdd={addCategory}
              onRename={(categoryId, title) =>
                setGame((current) => ({
                  ...current,
                  categories: current.categories.map((category) =>
                    category.id === categoryId ? { ...category, title } : category
                  )
                }))
              }
              onRemove={(categoryId) =>
                setGame((current) => ({
                  ...current,
                  categories: current.categories.filter((category) => category.id !== categoryId),
                  questions: current.questions.filter((question) => question.categoryId !== categoryId)
                }))
              }
            />
            {questionsByCategory.map(({ category, questions }) => (
              <section className="editor-section nested-section" key={category.id}>
                <h3>{category.title || "Kategorie bez názvu"}</h3>
                <div className="item-list">
                  {questions.map((question) => (
                    <FirstRoundQuestionEditor
                      key={question.id}
                      question={question}
                      categoryTitle={category.title || "bez názvu"}
                      audioAssets={audioAssets}
                      onChange={updateQuestion}
                      onUploadAudio={onUploadAudio}
                    />
                  ))}
                </div>
              </section>
            ))}
          </section>
        </section>
      ) : null}

      {activeTab === "listening" ? (
        <section
          aria-labelledby="editor-tab-listening"
          className="editor-tab-panel"
          id="editor-panel-listening"
          role="tabpanel"
        >
          <section className="editor-section">
            <h2>Druhé kolo: poslech</h2>
            <label className="field-stack">
              <span>Žánr / sloupec</span>
              <input
                value={game.listeningGenres[0]?.title ?? ""}
                onChange={(event) =>
                  setGame((current) => {
                    const genre = current.listeningGenres[0] ?? { id: makeId("genre"), title: "" };
                    const nextGenre = { ...genre, title: event.target.value };
                    return {
                      ...current,
                      listeningGenres: [
                        nextGenre,
                        ...current.listeningGenres.filter((candidate) => candidate.id !== genre.id)
                      ],
                      listeningItems: current.listeningItems.map((item) => ({
                        ...item,
                        genreId: item.genreId ?? nextGenre.id,
                        categoryId: item.categoryId ?? nextGenre.id
                      }))
                    };
                  })
                }
              />
            </label>
            <CategoryEditor
              title="Žánry poslechového kola"
              addLabel="Přidat žánr"
              emptyLabel="Zatím nejsou přidané žádné žánry."
              deleteMessage="Smazáním žánru se smažou i jeho poslechové položky. Pokračovat?"
              groups={game.listeningGenres}
              onAdd={addGenre}
              onRename={(genreId, title) =>
                setGame((current) => ({
                  ...current,
                  listeningGenres: current.listeningGenres.map((genre) =>
                    genre.id === genreId ? { ...genre, title } : genre
                  )
                }))
              }
              onRemove={(genreId) =>
                setGame((current) => ({
                  ...current,
                  listeningGenres: current.listeningGenres.filter((genre) => genre.id !== genreId),
                  listeningItems: current.listeningItems.filter((item) => (item.genreId ?? item.categoryId) !== genreId)
                }))
              }
            />
            <div className="section-heading-row">
              <h3>Poslechové položky</h3>
              <button className="button-compact" type="button" onClick={addListeningItem}>
                Přidat poslechovou položku
              </button>
              <button className="button-compact" type="button" onClick={addListeningItem}>
                Přidat poslechový track
              </button>
            </div>
            <div className="item-list">
              {game.listeningItems.map((item) => (
                <ListeningItemEditor
                  key={item.id}
                  item={item}
                  genres={game.listeningGenres}
                  audioAssets={audioAssets}
                  onChange={updateListeningItem}
                  onUploadAudio={onUploadAudio}
                  onRemove={() =>
                    setGame((current) => ({
                      ...current,
                      listeningItems: current.listeningItems.filter((currentItem) => currentItem.id !== item.id)
                    }))
                  }
                />
              ))}
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === "common-denominator" ? (
        <section
          aria-labelledby="editor-tab-common-denominator"
          className="editor-tab-panel"
          id="editor-panel-common-denominator"
          role="tabpanel"
        >
          <section className="editor-section">
            <div className="section-heading-row">
              <h2>Třetí kolo: společný jmenovatel</h2>
              <button className="button-compact" type="button" onClick={addCommonDenominatorItem}>
                Přidat společný jmenovatel
              </button>
              <button className="button-compact" type="button" onClick={addCommonDenominatorItem}>
                Přidat položku
              </button>
            </div>
            <div className="item-list">
              {game.commonDenominatorItems.map((item, index) => (
                <article className="editor-card" key={item.id}>
                  <label className="field-stack">
                    <span>{`Název položky společného jmenovatele ${index + 1}`}</span>
                    <input
                      value={item.title}
                      onChange={(event) =>
                        updateCommonDenominatorItem({ ...item, title: event.target.value })
                      }
                    />
                  </label>
                  <label className="field-stack">
                    <span>Clues</span>
                    <textarea
                      value={item.clues.map((clue) => clue.text ?? clue.prompt ?? "").join("\n")}
                      onChange={(event) =>
                        updateCommonDenominatorItem({
                          ...item,
                          clues: event.target.value.split("\n").map((text, clueIndex) => ({
                            id: item.clues[clueIndex]?.id ?? makeId("clue"),
                            text,
                            prompt: text,
                            order: clueIndex + 1
                          }))
                        })
                      }
                    />
                  </label>
                  <label className="field-stack">
                    <span>Správná odpověď</span>
                    <input
                      value={item.answer}
                      onChange={(event) =>
                        updateCommonDenominatorItem({ ...item, answer: event.target.value })
                      }
                    />
                  </label>
                  <label className="field-stack">
                    <span>Vysvětlení pro moderátora</span>
                    <textarea
                      value={item.explanation ?? item.moderatorNote ?? ""}
                      onChange={(event) =>
                        updateCommonDenominatorItem({
                          ...item,
                          explanation: event.target.value || undefined,
                          moderatorNote: event.target.value || undefined
                        })
                      }
                    />
                  </label>
                  <label className="field-stack">
                    <span>Nápověda</span>
                    <input
                      value={item.hint ?? ""}
                      onChange={(event) =>
                        updateCommonDenominatorItem({
                          ...item,
                          hint: event.target.value || undefined
                        })
                      }
                    />
                  </label>
                  <CommonDenominatorEditor
                    round={{ answer: item.answer, clues: item.clues }}
                    onChange={(commonDenominator) =>
                      updateCommonDenominatorItem({
                        ...item,
                        answer: commonDenominator.answer,
                        clues: commonDenominator.clues
                      })
                    }
                    audioAssets={audioAssets}
                    onUploadAudio={onUploadAudio}
                    onAddClue={() =>
                      updateCommonDenominatorItem({
                        ...item,
                        clues: [...item.clues, { id: makeId("clue"), text: "" }]
                      })
                    }
                    onRemoveClue={(clueId) =>
                      updateCommonDenominatorItem({
                        ...item,
                        clues: item.clues.filter((clue) => clue.id !== clueId)
                      })
                    }
                  />
                </article>
              ))}
            </div>
          </section>
        </section>
      ) : null}

      <div className="editor-save-bar">
        <button type="submit" disabled={isSaving}>
          {isSaving ? "Ukládám..." : "Uložit hru"}
        </button>
      </div>
    </form>
  );
}

export { GameEditor };

function normalizeListeningItems(game: EditableGame): ListeningItem[] {
  return game.listeningItems.map((item) => {
    const artist = item.artist ?? item.artistAnswer ?? "";
    const trackTitle = item.title ?? item.trackTitle ?? item.trackTitleAnswer ?? item.answer ?? "";
    const genreId = item.genreId ?? item.categoryId ?? game.listeningGenres[0]?.id ?? "";
    const currentAnswer = item.answer ?? "";
    const isGenerated = !currentAnswer.trim() || (
      item.generatedAnswer !== undefined && currentAnswer === item.generatedAnswer
    );
    const answer = isGenerated
      ? [artist, trackTitle].filter(Boolean).join(" - ")
      : currentAnswer;

    return {
      ...item,
      categoryId: genreId,
      genreId,
      artist,
      title: trackTitle,
      trackTitle,
      points: item.points ?? 100,
      prompt: (item.prompt ?? "").trim() || "Poznej interpreta a název skladby.",
      answer,
      generatedAnswer: isGenerated ? answer : undefined,
      trackTitleAnswer: trackTitle,
      artistAnswer: artist,
      audioUrl: item.audio?.src ?? item.audioUrl,
      scoring: { artist: 1000, title: 3000, both: 5000 }
    };
  });
}

function createRoundShell(type: RoundType, game: EditableGame, id: string): Game["rounds"][number] {
  if (type === "listening") {
    return {
      id,
      type,
      title: "Poslechové kolo",
      categories: game.listeningGenres,
      tracks: game.listeningItems
    };
  }

  if (type === "common-denominator") {
    return {
      id,
      type,
      title: "Společný jmenovatel",
      points: 300,
      answer: game.commonDenominatorItems[0]?.answer ?? "",
      clues: game.commonDenominatorItems[0]?.clues ?? [],
      items: game.commonDenominatorItems
    };
  }

  return {
    id,
    type,
    title: "Otázkové kolo",
    categories: game.categories,
    questions: game.questions,
    items: game.questions
  };
}

function roundTypeLabel(type: RoundType) {
  if (type === "listening") {
    return "Poslechové kolo";
  }

  if (type === "common-denominator") {
    return "Společný jmenovatel";
  }

  return "Otázkové kolo";
}

function slugify(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "riskuj-hra";
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Soubor nejde přečíst.")));
    reader.readAsText(file);
  });
}
