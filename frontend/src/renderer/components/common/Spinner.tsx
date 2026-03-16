import '../../styles/spinner.css'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
}

/**
 * CSS-only spinning loader. Sizes: sm (16px), md (24px), lg (40px).
 */
export default function Spinner({ size = 'md' }: SpinnerProps) {
  return (
    <div
      className={`spinner spinner--${size}`}
      role="status"
      aria-label="Loading"
    />
  )
}
