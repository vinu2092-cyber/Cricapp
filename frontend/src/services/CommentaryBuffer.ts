/**
 * CommentaryBuffer - Manages ball-by-ball commentary dedup and buffering
 * Keeps max 100 balls in memory, deduplicates by content-based ID
 */

import { Commentary } from '../types/match';

// Max commentary items to keep in buffer (max 100)
const MAX_BALLS = 100;

class CommentaryBuffer {
  private buffer: Map<string, Commentary> = new Map();

  /**
   * Add new commentary items, deduplicating by ID
   * Returns the merged list (newest first)
   */
  addBalls(newBalls: Commentary[]): Commentary[] {
    for (const ball of newBalls) {
      if (ball.id && !this.buffer.has(ball.id)) {
        this.buffer.set(ball.id, ball);
      }
    }

    // Trim to MAX_BALLS (keep newest)
    if (this.buffer.size > MAX_BALLS) {
      const entries = Array.from(this.buffer.entries());
      const trimmed = entries.slice(entries.length - MAX_BALLS);
      this.buffer = new Map(trimmed);
    }

    return this.getAll();
  }

  /**
   * Get all buffered commentary items
   */
  getAll(): Commentary[] {
    return Array.from(this.buffer.values());
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.buffer.clear();
  }

  /**
   * Get current buffer size
   */
  get size(): number {
    return this.buffer.size;
  }
}

export default CommentaryBuffer;
export { MAX_BALLS };
