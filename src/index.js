import React from 'react'
import useIsomorphicLayoutEffect from './useIsomorphicLayoutEffect'
import { useResizeObserver } from './useResizeObserver'

const defaultEstimateSize = () => 50

const defaultKeyExtractor = index => index

const defaultMeasureSize = (el, horizontal) => {
  const key = horizontal ? 'offsetWidth' : 'offsetHeight'

  return el[key]
}

export const defaultRangeExtractor = range => {
  const start = Math.max(range.start - range.overscan, 0)
  const end = Math.min(range.end + range.overscan, range.size - 1)

  const arr = []

  for (let i = start; i <= end; i++) {
    arr.push(i)
  }

  return arr
}

export function useVirtual({
  size = 0,
  estimateSize = defaultEstimateSize,
  overscan = 1,
  paddingStart = 0,
  paddingEnd = 0,
  parentRef,
  horizontal,
  scrollToFn: scrollToFnProps,
  useObserver,
  initialRect,
  onScrollElement,
  scrollOffsetFn,
  keyExtractor = defaultKeyExtractor,
  measureSize = defaultMeasureSize,
  rangeExtractor = defaultRangeExtractor,
}) {
  const sizeKey = horizontal ? 'width' : 'height'
  const scrollKey = horizontal ? 'scrollLeft' : 'scrollTop'

  const latestRef = React.useRef({
    scrollOffset: 0,
    measurements: [],
    pendingMeasuredCacheIndexes: [],
    measureSize,
    measureRefCache: {},
    scrollOffsetFn,
    keyExtractor,
    mounted: false,
  })

  latestRef.current.measureSize = measureSize
  latestRef.current.keyExtractor = keyExtractor

  const [scrollOffset, setScrollOffset] = React.useState(0)
  latestRef.current.scrollOffset = scrollOffset

  const useMeasureParent = useObserver || useResizeObserver

  const { [sizeKey]: outerSize } = useMeasureParent(parentRef, initialRect)

  latestRef.current.outerSize = outerSize

  const [measuredCache, setMeasuredCache] = React.useState({})

  const measure = React.useCallback(() => {
    setMeasuredCache({})
    Object.values(latestRef.current.measureRefCache).forEach((measureRef) => {
      measureRef.forceUpdate();
    });
  }, [])

  const measurements = React.useMemo(() => {
    const min =
      latestRef.current.pendingMeasuredCacheIndexes.length > 0
        ? Math.min(...latestRef.current.pendingMeasuredCacheIndexes)
        : 0
    latestRef.current.pendingMeasuredCacheIndexes = []

    const measurements = latestRef.current.measurements.slice(0, min)

    for (let i = min; i < size; i++) {
      const key = keyExtractor(i)
      const measuredSize = measuredCache[key]
      const start = measurements[i - 1] ? measurements[i - 1].end : paddingStart
      const size =
        typeof measuredSize === 'number' ? measuredSize : estimateSize(i)
      const end = start + size
      measurements[i] = { index: i, start, size, end, key }
    }
    return measurements
  }, [estimateSize, measuredCache, paddingStart, size, keyExtractor])

  const totalSize = (measurements[size - 1]?.end || paddingStart) + paddingEnd

  latestRef.current.measurements = measurements
  latestRef.current.totalSize = totalSize

  const element = onScrollElement ? onScrollElement.current : parentRef.current

  const onScroll = React.useCallback(event => {
    const offset = latestRef.current.scrollOffsetFn
      ? latestRef.current.scrollOffsetFn(event)
      : element[scrollKey]

    setScrollOffset(offset)
  }, [element, scrollKey])

  useIsomorphicLayoutEffect(() => {
    if (!element) {
      setScrollOffset(0)

      return
    }

    onScroll()

    element.addEventListener('scroll', onScroll, {
      capture: false,
      passive: true,
    })

    return () => {
      element.removeEventListener('scroll', onScroll)
    }
  }, [element, scrollKey, onScroll, outerSize])

  const { start, end } = calculateRange(latestRef.current)

  const virtualItems = React.useMemo(() => {
    const indexes = rangeExtractor({
      start,
      end,
      overscan,
      size: measurements.length,
    })

    const virtualItems = []

    for (let k = 0, len = indexes.length; k < len; k++) {
      const i = indexes[k]
      const measurement = measurements[i]
      const key = latestRef.current.keyExtractor(i)

      const item = {
        ...measurement,
        measureRef: getMeasureRef(latestRef.current.measureRefCache, key, el => {
          if (el) {
            const measuredSize = latestRef.current.measureSize(el, horizontal)

            if (measuredSize !== item.size) {
              latestRef.current.pendingMeasuredCacheIndexes.push(i)

              setMeasuredCache(old => ({
                ...old,
                [item.key]: measuredSize,
              }))

              // Deal with the case that this function (measureRef) is cached by outside world in order to reduce re-renders.
              // Otherwise there will be infinite measureRef calls during scrolling, causing performance issues.
              item.size = measuredSize
            }
          }
        }),
      }

      virtualItems.push(item)
    }

    return virtualItems
  }, [rangeExtractor, start, end, overscan, measurements, horizontal])

  useIsomorphicLayoutEffect(() => {
    if (latestRef.current.mounted) {
      setMeasuredCache({})
    }
    latestRef.current.mounted = true
  }, [estimateSize])

  const scrollToIndex = React.useMemo(
    () => {
      const defaultScrollToFn = offset => {
        const parent = parentRef.current;
        if (parent) {
          if (horizontal) {
            parent.scrollTo({
              left: offset,
              top: parent.scrollTop,
              behavior: 'smooth',
            });
          } else {
            parent.scrollTo({
              left: parent.scrollLeft,
              top: offset,
              behavior: 'smooth',
            });
          }
        }
      }

      const scrollToFn = scrollToFnProps || defaultScrollToFn

      const scrollToOffset = (toOffset, { align = 'start' } = {}) => {
        const { scrollOffset, outerSize } = latestRef.current

        if (align === 'auto') {
          if (toOffset <= scrollOffset) {
            align = 'start'
          } else if (toOffset >= scrollOffset + outerSize) {
            align = 'end'
          } else {
            align = 'start'
          }
        }

        if (align === 'start') {
          scrollToFn(toOffset)
        } else if (align === 'end') {
          scrollToFn(toOffset - outerSize)
        } else if (align === 'center') {
          scrollToFn(toOffset - outerSize / 2)
        }
      }

      const tryScrollToIndex = (index, options = {}) => {
        let { align = 'auto' } = options
        const { measurements, scrollOffset, outerSize } = latestRef.current

        const measurement = measurements[Math.max(0, Math.min(index, size - 1))]

        if (!measurement) {
          return
        }

        if (align === 'auto') {
          if (measurement.end >= scrollOffset + outerSize) {
            align = 'end'
          } else if (measurement.start <= scrollOffset) {
            align = 'start'
          } else {
            return
          }
        }

        const toOffset =
          align === 'center'
            ? measurement.start + measurement.size / 2
            : align === 'end'
            ? measurement.end
            : measurement.start

        scrollToOffset(toOffset, { ...options, align })
      }

      return (index, options) => {
        // We do a double request here because of
        // dynamic sizes which can cause offset shift
        // and end up in the wrong spot. Unfortunately,
        // we can't know about those dynamic sizes until
        // we try and render them. So double down!
        tryScrollToIndex(index, options)
        requestAnimationFrame(() => {
          tryScrollToIndex(index, options)
        })
      }
    },
    [horizontal, parentRef, scrollToFnProps, size]
  )

  return {
    virtualItems,
    totalSize,
    scrollToIndex,
    measure,
  }
}

const getMeasureRef = (measureRefCache, key, doMeasure) => {
  if (!measureRefCache[key]) {
    const measureRef = (el) => {
      measureRef.current?.(el); // eslint-disable-line no-unused-expressions
      measureRef.el = el;
    };

    measureRef.el = null;
    measureRef.forceUpdate = () => measureRef.current?.(measureRef.el);
    measureRefCache[key] = measureRef;
  }

  measureRefCache[key].current = doMeasure;
  return measureRefCache[key];
}

const findNearestBinarySearch = (low, high, getCurrentValue, value) => {
  while (low <= high) {
    let middle = ((low + high) / 2) | 0
    let currentValue = getCurrentValue(middle)

    if (currentValue < value) {
      low = middle + 1
    } else if (currentValue > value) {
      high = middle - 1
    } else {
      return middle
    }
  }

  if (low > 0) {
    return low - 1
  } else {
    return 0
  }
}

function calculateRange({ measurements, outerSize, scrollOffset }) {
  const size = measurements.length - 1
  const getOffset = index => measurements[index].start

  let start = findNearestBinarySearch(0, size, getOffset, scrollOffset)
  let end = start

  while (end < size && measurements[end].end < scrollOffset + outerSize) {
    end++
  }

  return { start, end }
}
