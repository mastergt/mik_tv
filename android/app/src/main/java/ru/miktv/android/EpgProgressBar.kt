package ru.miktv.android

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.View

/**
 * A compact, non-interactive two-colour bar for the ON-AIR programme in the guide.
 * Bright part = already aired, dark part = time remaining. Not a video seekbar.
 */
class EpgProgressBar(context: Context) : View(context) {
    private val aired = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(245, 245, 247)
        style = Paint.Style.FILL
    }
    private val remaining = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(98, 104, 113)
        style = Paint.Style.FILL
    }

    var fraction: Float = 0f
        set(value) {
            field = value.coerceIn(0f, 1f)
            invalidate()
        }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        canvas.drawRect(0f, 0f, w, h, remaining)
        canvas.drawRect(0f, 0f, w * fraction, h, aired)
    }
}
