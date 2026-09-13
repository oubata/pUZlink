package com.oubata.colorlink;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

/**
 * The artwork runs to all four edges of the phone, and the board gets the whole
 * screen.
 *
 * Two separate things are going on:
 *
 * 1. The window is laid out edge to edge with both system bars transparent, so
 *    the picture is behind the status bar rather than stopping under a grey
 *    band. The status bar itself stays — the clock and the battery are still
 *    there while playing, floating over the artwork — and its icons are set
 *    light, because the top of the artwork is deep blue.
 * 2. The navigation bar is hidden while the app is in front. Hidden, not
 *    disabled: a swipe from the bottom edge brings it back as a transient
 *    overlay that fades again on its own, and the content never relayouts
 *    around it.
 *
 * Android drops a hide request whenever the window loses focus — a permission
 * dialog, the recents switcher, an incoming call — so it is made again every
 * time focus comes back rather than once at startup.
 *
 * Going edge to edge means the web layout has to know where the status bar is,
 * or the top bar would sit under the clock. `env(safe-area-inset-top)` cannot
 * be trusted for that here: on Android the WebView fills it from the display
 * cutout, so it reads 0 on a phone whose status bar sits in ordinary screen
 * space. The real inset is measured below and handed to the page as
 * `--inset-top`, which the stylesheet already falls back to `env()` for on
 * every other platform.
 */
public class MainActivity extends BridgeActivity {

    /**
     * The last inset the system reported, in CSS pixels, or -1 before the first
     * one arrives.
     *
     * The window is laid out long before the WebView has a document: the first
     * insets arrive during the first frame, while `index.html` is still
     * loading, so the property set then lands on a document that is about to be
     * thrown away. Keeping the value means it can be published again the moment
     * there is a page to put it on.
     */
    private int lastInsetTop = -1;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Or Android paints its own scrim behind the gesture bar.
            getWindow().setNavigationBarContrastEnforced(false);
        }

        watchInsets();
        republishOnPageLoad();
        hideNavigationBar();
    }

    @Override
    public void onResume() {
        super.onResume();
        // Covers a return from the background, where the page is already loaded
        // and no new insets are dispatched.
        publishInsetTop();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideNavigationBar();
            publishInsetTop();
        }
    }

    private WindowInsetsControllerCompat insetsController() {
        return WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
    }

    private void hideNavigationBar() {
        WindowInsetsControllerCompat controller = insetsController();
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.navigationBars());
        // The artwork is deep blue where the status bar sits.
        controller.setAppearanceLightStatusBars(false);
    }

    /**
     * Record the status bar's height, in CSS pixels, every time the system
     * reports it. Rotation and a cutout appearing on one edge both come through
     * here.
     */
    private void watchInsets() {
        View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(
            decor,
            (view, windowInsets) -> {
                Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.displayCutout()
                );
                float density = getResources().getDisplayMetrics().density;
                lastInsetTop = Math.round(bars.top / density);
                publishInsetTop();
                return windowInsets;
            }
        );
    }

    /** The page that the inset belongs to has just finished loading. */
    private void republishOnPageLoad() {
        if (getBridge() == null) return;
        getBridge()
            .addWebViewListener(
                new WebViewListener() {
                    @Override
                    public void onPageLoaded(WebView webView) {
                        publishInsetTop();
                    }
                }
            );
    }

    private void publishInsetTop() {
        if (lastInsetTop < 0 || getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;
        webView.evaluateJavascript(
            "document.documentElement.style.setProperty('--inset-top','" + lastInsetTop + "px')",
            null
        );
    }
}
