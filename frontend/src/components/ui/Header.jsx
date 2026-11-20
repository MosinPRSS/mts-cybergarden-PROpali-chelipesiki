import { Link, useLocation } from 'react-router-dom'
import styles from './Header.module.css'

const navLinks = [
  { label: 'Профиль', to: '/profile' },
  { label: 'Создать план', to: '/create-plan' },
  { label: 'КБЖУ', to: '/calories' },
  { label: 'Рецепты', to: '/recipes' },
]

function Header() {
  const location = useLocation()

  return (
    <header className={styles.header}>
      <Link to="/" className={styles.logo}>WOUT</Link>
      <nav className={styles.nav}>
        {navLinks.map((link) => (
          <Link
            key={link.label}
            to={link.to}
            className={`${styles.navLink} ${location.pathname.startsWith(link.to) ? styles.navLinkActive : ''}`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  )
}

export default Header
