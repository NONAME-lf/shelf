data class Book(val title: String, val shelf: Int)

fun main() {
    val books = listOf(Book("Clean Code", 1), Book("Kotlin in Action", 2), Book("SICP", 1))
    books.groupBy { it.shelf }
        .toSortedMap()
        .forEach { (shelf, items) -> println("Полиця $shelf: ${items.joinToString { it.title }}") }
}
