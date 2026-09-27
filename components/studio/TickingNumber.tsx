import { useCountUp } from './useCountUp';

/** Score tick: renders inside a <Text>; counts to new values in studio directions. */
export function TickingNumber({ value }: { value: number }) {
  const shown = useCountUp(value, 520);
  return <>{shown}</>;
}
