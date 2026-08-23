import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { cn } from "../../lib/utils"
import { Button } from "./button"
import { Calendar } from "./calendar"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import moment from "moment"

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  disabled,
}) {
  const [open, setOpen] = React.useState(false)
  const [selectedDate, setSelectedDate] = React.useState(
    value ? new Date(value) : undefined
  )

  React.useEffect(() => {
    if (value) {
      setSelectedDate(new Date(value))
    }
  }, [value])

  const handleSelect = (date) => {
    if (!date) return
    setSelectedDate(date)
    onChange?.(date)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !selectedDate && "text-muted-foreground",
            className
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {selectedDate
            ? moment(selectedDate).format("DD/MM/YYYY")
            : placeholder}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}