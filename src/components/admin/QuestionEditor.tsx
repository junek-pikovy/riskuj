import type { AudioAsset, Game, ListeningGenre, ListeningItem, Question } from "../../types/game";
import AudioUploadField from "./AudioUploadField";

type AdminCommonDenominatorRound = NonNullable<Game["commonDenominator"]>;

type FirstRoundQuestionEditorProps = {
  question: Question;
  categoryTitle: string;
  audioAssets: AudioAsset[];
  onChange: (question: Question) => void;
  onUploadAudio?: (file: File) => Promise<AudioAsset>;
};

export function FirstRoundQuestionEditor({
  question,
  categoryTitle,
  audioAssets,
  onChange,
  onUploadAudio
}: FirstRoundQuestionEditorProps) {
  const suffix = `${question.points} bodů v kategorii ${categoryTitle}`;

  return (
    <article className="editor-card">
      <h4>{question.points} bodů</h4>
      <label className="field-stack">
        <span>{`Zadání otázky ${suffix}`}</span>
        <textarea
          value={question.prompt}
          onChange={(event) => onChange({ ...question, prompt: event.target.value })}
        />
      </label>
      <label className="field-stack">
        <span>{`Odpověď otázky ${suffix}`}</span>
        <input
          value={question.answer}
          onChange={(event) => onChange({ ...question, answer: event.target.value })}
        />
      </label>
      <label className="field-stack">
        <span>{`Poznámka moderátora otázky ${suffix}`}</span>
        <textarea
          value={question.moderatorNote ?? ""}
          onChange={(event) =>
            onChange({ ...question, moderatorNote: event.target.value || undefined })
          }
        />
      </label>
      <AudioUploadField
        audio={question.audio}
        audioAssets={audioAssets}
        label={`Audio otázky ${suffix}`}
        onChange={(audio) => onChange({ ...question, audio })}
        onUploadAudio={onUploadAudio}
      />
    </article>
  );
}

type ListeningItemEditorProps = {
  item: ListeningItem;
  genres: ListeningGenre[];
  audioAssets: AudioAsset[];
  onChange: (item: ListeningItem) => void;
  onUploadAudio?: (file: File) => Promise<AudioAsset>;
  onRemove: () => void;
};

export function ListeningItemEditor({
  item,
  genres,
  audioAssets,
  onChange,
  onUploadAudio,
  onRemove
}: ListeningItemEditorProps) {
  return (
    <article className="editor-card">
      <div className="section-heading-row">
        <h4>{item.title || "Nová poslechová položka"}</h4>
        <button className="danger-button button-compact" type="button" onClick={onRemove}>
          Smazat položku
        </button>
      </div>
      <div className="editor-grid">
        <label className="field-stack">
          <span>Žánr poslechové položky</span>
          <select
            value={item.genreId ?? item.categoryId}
            onChange={(event) => onChange({ ...item, genreId: event.target.value, categoryId: event.target.value })}
          >
            {genres.map((genre) => (
              <option key={genre.id} value={genre.id}>
                {genre.title || "Bez názvu"}
              </option>
            ))}
          </select>
        </label>
        <label className="field-stack">
          <span>Název skladby</span>
          <input
            value={item.title}
            onChange={(event) => onChange({ ...item, title: event.target.value })}
          />
        </label>
        <label className="field-stack">
          <span>Interpret</span>
          <input
            value={item.artist}
            onChange={(event) => onChange({ ...item, artist: event.target.value })}
          />
        </label>
      </div>
      <label className="field-stack">
        <span>Zadání poslechové položky</span>
        <textarea
          value={item.prompt}
          onChange={(event) => onChange({ ...item, prompt: event.target.value })}
        />
      </label>
      <label className="field-stack">
        <span>Odpověď poslechové položky</span>
        <input
          value={item.answer ?? ""}
          onChange={(event) => onChange({ ...item, answer: event.target.value, generatedAnswer: undefined })}
        />
      </label>
      <AudioUploadField
        audio={item.audio}
        audioAssets={audioAssets}
        label="Audio poslechové položky"
        onChange={(audio) => onChange({ ...item, audio, audioUrl: audio?.src })}
        onUploadAudio={onUploadAudio}
      />
    </article>
  );
}

type CommonDenominatorEditorProps = {
  round: AdminCommonDenominatorRound;
  audioAssets: AudioAsset[];
  onChange: (round: AdminCommonDenominatorRound) => void;
  onUploadAudio?: (file: File) => Promise<AudioAsset>;
  onAddClue: () => void;
  onRemoveClue: (clueId: string) => void;
};

export function CommonDenominatorEditor({
  round,
  audioAssets,
  onChange,
  onUploadAudio,
  onAddClue,
  onRemoveClue
}: CommonDenominatorEditorProps) {
  return (
    <div className="item-list">
      <label className="field-stack">
        <span>Společný jmenovatel</span>
        <input
          value={round.answer}
          onChange={(event) => onChange({ ...round, answer: event.target.value })}
        />
      </label>
      {round.clues.map((clue, index) => (
        <div className="field-row" key={clue.id}>
          <div className="field-stack">
            <label className="field-stack">
              <span>{`Indicie ${index + 1}`}</span>
              <textarea
                value={clue.text ?? clue.prompt ?? ""}
                onChange={(event) =>
                  onChange({
                    ...round,
                    clues: round.clues.map((current) =>
                      current.id === clue.id
                        ? { ...current, text: event.target.value, prompt: event.target.value }
                        : current
                    )
                  })
                }
              />
            </label>
            <AudioUploadField
              audio={clue.audio}
              audioAssets={audioAssets}
              label={`Audio indicie ${index + 1}`}
              onChange={(audio) =>
                onChange({
                  ...round,
                  clues: round.clues.map((current) =>
                    current.id === clue.id ? { ...current, audio } : current
                  )
                })
              }
              onUploadAudio={onUploadAudio}
            />
          </div>
          <button
            className="danger-button button-compact"
            type="button"
            onClick={() => onRemoveClue(clue.id)}
          >
            Smazat indicii
          </button>
        </div>
      ))}
      <button className="button-compact" type="button" onClick={onAddClue}>
        Přidat indicii
      </button>
    </div>
  );
}
