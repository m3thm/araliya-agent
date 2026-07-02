import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Product } from "../../types";
import ProductCard from "./ProductCard";

interface Props {
  products: Product[];
}

const EDGE_EPSILON = 4;
const DRAG_THRESHOLD = 5;

export default function ProductCarousel({ products }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pointerDownRef = useRef(false);
  const draggedRef = useRef(false);
  const startXRef = useRef(0);
  const startScrollLeftRef = useRef(0);

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [dragging, setDragging] = useState(false);

  const updateEdges = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > EDGE_EPSILON);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - EDGE_EPSILON);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateEdges();
    const ro = new ResizeObserver(updateEdges);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.length]);

  const scrollByPage = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.85 * (direction === "left" ? -1 : 1);
    el.scrollBy({ left: amount, behavior: "smooth" });
  };

  // Mouse click-and-drag scrolling. Touch already scrolls natively (and
  // benefits from momentum + scroll-snap), so this only kicks in for
  // pointerType "mouse" — trackpads and touchscreens are left alone.
  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = scrollRef.current;
    if (!el) return;
    pointerDownRef.current = true;
    draggedRef.current = false;
    startXRef.current = e.clientX;
    startScrollLeftRef.current = el.scrollLeft;
    // Deliberately NOT calling setPointerCapture here — capturing this
    // early would redirect click's compatibility mouse events away from
    // whatever nested button was pressed, breaking normal Add/quantity
    // clicks on ProductCard. We only capture once a drag is confirmed,
    // in handlePointerMove below.
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointerDownRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const dx = e.clientX - startXRef.current;
    if (!draggedRef.current && Math.abs(dx) > DRAG_THRESHOLD) {
      draggedRef.current = true;
      setDragging(true);
      el.setPointerCapture(e.pointerId);
    }
    if (draggedRef.current) {
      el.scrollLeft = startScrollLeftRef.current - dx;
      updateEdges();
    }
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointerDownRef.current) return;
    pointerDownRef.current = false;
    setDragging(false);
    if (draggedRef.current && scrollRef.current?.hasPointerCapture(e.pointerId)) {
      scrollRef.current.releasePointerCapture(e.pointerId);
    }
  };

  // Swallow the click that would otherwise fire on a card/button right
  // after a drag gesture ends on top of it.
  const handleClickCapture = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (draggedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      draggedRef.current = false;
    }
  };

  return (
    <div className="flex gap-3">
      <div
        className="size-8 rounded-full bg-brand text-white grid place-items-center text-sm flex-shrink-0 mt-0.5"
        aria-hidden="true"
      >
        A
      </div>

      <div className="relative flex-1 min-w-0 group/carousel">
        {canScrollLeft && (
          <div
            className="pointer-events-none absolute left-0 top-0 bottom-1 w-8 bg-gradient-to-r from-surface to-transparent z-10"
            aria-hidden="true"
          />
        )}
        {canScrollRight && (
          <div
            className="pointer-events-none absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-surface to-transparent z-10"
            aria-hidden="true"
          />
        )}

        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scrollByPage("left")}
            aria-label="Scroll products left"
            className="hidden sm:grid absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 size-9 place-items-center rounded-full bg-surface-card border border-border shadow-md text-brand hover:bg-brand hover:text-white hover:border-brand transition-colors opacity-0 group-hover/carousel:opacity-100 focus-visible:opacity-100"
          >
            <ChevronLeft className="size-4" />
          </button>
        )}
        {canScrollRight && (
          <button
            type="button"
            onClick={() => scrollByPage("right")}
            aria-label="Scroll products right"
            className="hidden sm:grid absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-20 size-9 place-items-center rounded-full bg-surface-card border border-border shadow-md text-brand hover:bg-brand hover:text-white hover:border-brand transition-colors opacity-0 group-hover/carousel:opacity-100 focus-visible:opacity-100"
          >
            <ChevronRight className="size-4" />
          </button>
        )}

        <div
          ref={scrollRef}
          onScroll={updateEdges}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          onClickCapture={handleClickCapture}
          className={`flex gap-3 overflow-x-auto pb-1 scrollbar-hide select-none sm:cursor-grab ${
            dragging ? "sm:cursor-grabbing" : "snap-x snap-mandatory"
          }`}
        >
          {products.map((product) => (
            <div key={product.id} className="flex-none w-[200px] sm:w-[220px] snap-start">
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
