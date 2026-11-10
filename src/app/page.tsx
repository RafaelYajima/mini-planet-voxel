import { GameProvider } from "@/context/GameContext";
import GameCanvas from "@/components/GameCanvas";

export default function HomePage() {
  return (
    <GameProvider>
      <GameCanvas />
    </GameProvider>
  );
}
