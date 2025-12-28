import { useCallback, useEffect, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent } from "react";

const DRAG_PIXELS_PER_STEP = 8;

type NumberProps = {
    value: number;
    onChange: (value: number) => void;
    step?: number;
    min?: number;
    max?: number;
};

export const Number = ({ value: externalValue, onChange, step, min, max }: NumberProps) => {
    const [value, setValue] = useState<number>(externalValue);
    const [isDragging, setIsDragging] = useState(false);

    const valueRef = useRef(externalValue);
    const dragStateRef = useRef<{ startX: number; startValue: number } | null>(null);
    const isDraggingRef = useRef(false);
    const stepRef = useRef(step ?? 1);
    const minRef = useRef<number | undefined>(min);
    const maxRef = useRef<number | undefined>(max);
    const onChangeRef = useRef(onChange);

    useEffect(() => {
        stepRef.current = step ?? 1;
    }, [step]);

    useEffect(() => {
        minRef.current = min;
    }, [min]);

    useEffect(() => {
        maxRef.current = max;
    }, [max]);

    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    useEffect(() => {
        if (isDraggingRef.current) {
            return;
        }
        valueRef.current = externalValue;
        setValue(externalValue);
    }, [externalValue]);

    const clampValue = useCallback((candidate: number): number => {
        let next = candidate;
        if (minRef.current !== undefined) {
            next = Math.max(minRef.current, next);
        }
        if (maxRef.current !== undefined) {
            next = Math.min(maxRef.current, next);
        }
        return next;
    }, []);

    const commitValue = useCallback(
        (candidate: number) => {
            const clamped = clampValue(candidate);
            if (clamped === valueRef.current) {
                return;
            }
            valueRef.current = clamped;
            setValue(clamped);
            onChangeRef.current(clamped);
        },
        [clampValue]
    );

    const handleInputChange = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            const parsed =  parseFloat(event.target.value);
            if (isNaN(parsed)) {
                setValue(valueRef.current);
                return;
            }
            commitValue(parsed);
        },
        [commitValue]
    );

    const handleMouseMove = useCallback(
        (event: MouseEvent) => {
            const dragState = dragStateRef.current;
            if (!dragState) {
                return;
            }

            const deltaX = event.clientX - dragState.startX;
            const increments = Math.round(deltaX / DRAG_PIXELS_PER_STEP);
            const nextValue = dragState.startValue + increments * (stepRef.current || 1);
            commitValue(nextValue);
        },
        [commitValue]
    );

    const endDrag = useCallback(() => {
        if (!isDraggingRef.current) {
            return;
        }
        isDraggingRef.current = false;
        dragStateRef.current = null;
        setIsDragging(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", endDrag);
    }, [handleMouseMove]);

    const handleMouseDown = useCallback(
        (event: ReactMouseEvent<HTMLInputElement>) => {
            if (event.button !== 0) {
                return;
            }
            event.preventDefault();

            dragStateRef.current = {
                startX: event.clientX,
                startValue: valueRef.current,
            };
            isDraggingRef.current = true;
            setIsDragging(true);
            document.body.style.cursor = "ew-resize";
            document.body.style.userSelect = "none";

            window.addEventListener("mousemove", handleMouseMove);
            window.addEventListener("mouseup", endDrag);
        },
        [handleMouseMove, endDrag]
    );

    useEffect(() => {
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", endDrag);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
    }, [handleMouseMove, endDrag]);

    return (
        <input
            type="number"
            className="w-full rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white focus:border-white/30 focus:outline-none"
            value={value}
            step={step}
            min={min}
            max={max}
            style={{ cursor: isDragging ? "ew-resize" : "ew-resize" }}
            onChange={handleInputChange}
            onMouseDown={handleMouseDown}
        />
    );
};