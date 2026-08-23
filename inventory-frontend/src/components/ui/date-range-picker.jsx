import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { format, parseISO } from "date-fns"

import { cn } from "../../lib/utils"
import { Button } from "./button"
import { Calendar } from "./calendar"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

const parseDate = (value) => {
  if (!value) return undefined
  if (value instanceof Date) return value
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

const DateRangePicker = ({
  value,
  onChange,
  placeholder = "Pick a date range",
  className,
  disabled,
}) => {
  const initialFrom = parseDate(value?.startDate)
  const initialTo = parseDate(value?.endDate)

  const [range, setRange] = React.useState({
    from: initialFrom,
    to: initialTo,
  })

  React.useEffect(() => {
    setRange({
      from: parseDate(value?.startDate),
      to: parseDate(value?.endDate),
    })
  }, [value?.startDate, value?.endDate])

  const handleSelect = (nextRange) => {
    setRange(nextRange || { from: undefined, to: undefined })

    if (!nextRange?.from || !nextRange?.to) return

    const startDate = nextRange.from.toISOString().slice(0, 10)
    const endDate = nextRange.to.toISOString().slice(0, 10)
    onChange?.({ startDate, endDate })
  }

  const label = React.useMemo(() => {
    if (!range?.from) return placeholder
    if (range.to) {
      return `${format(range.from, "dd/MM/yyyy")} - ${format(
        range.to,
        "dd/MM/yyyy"
      )}`
    }
    return format(range.from, "dd/MM/yyyy")
  }, [range?.from, range?.to, placeholder])

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-[260px] justify-start text-left font-normal",
              !range?.from && "text-muted-foreground"
            )}
            disabled={disabled}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            numberOfMonths={2}
            selected={range}
            onSelect={handleSelect}
            disabled={(date) =>
              date > new Date() || date < new Date("1900-01-01")
            }
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

export { DateRangePicker }

