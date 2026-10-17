import type { ListeningItem } from "../../types/game";

type ListeningRoundScreenProps = {
  item: ListeningItem;
  answerVisible: boolean;
};

export function ListeningRoundScreen({ item, answerVisible }: ListeningRoundScreenProps) {
  const artist = item.artistAnswer ?? item.artist ?? "Nezadáno";
  const trackTitle = item.trackTitleAnswer ?? item.trackTitle ?? item.title ?? "Nezadáno";

  return (
    <>
      <h2>Poslechové kolo</h2>
      <p>{item.prompt}</p>
      {item.audio ? (
        <audio aria-label="Přehrát audio ukázku" controls src={item.audio.src} />
      ) : (
        <p>Bez audia</p>
      )}
      {answerVisible ? (
        <div className="answer-panel">
          <h3>Odpověď</h3>
          <p>Interpret: {artist}</p>
          <p>Název: {trackTitle}</p>
          {item.answer && item.answer !== [artist, trackTitle].filter(Boolean).join(" - ") ? (
            <p>{item.answer}</p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export default ListeningRoundScreen;
