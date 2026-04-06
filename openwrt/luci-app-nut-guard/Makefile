# luci-app-nut-guard — LuCI UI for Nut Guard
#
# Drop the openwrt/luci-app-nut-guard/ directory into your OpenWrt package
# feed (e.g. package/luci-app-nut-guard/) and run:
#   make package/luci-app-nut-guard/compile
#
# Alternatively, if your tree has the luci feed at feeds/luci, you can
# include this directory there.

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-nut-guard
PKG_VERSION:=0.1.0
PKG_RELEASE:=1

PKG_MAINTAINER:=ospfx <https://github.com/ospfx>
PKG_LICENSE:=AGPL-3.0-or-later

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-nut-guard
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI support for Nut Guard
  DEPENDS:=+luci-base +nut-guard
  URL:=https://github.com/ospfx/nut-guard
  PKGARCH:=all
endef

define Package/luci-app-nut-guard/description
  LuCI web interface for Nut Guard UPS monitor.
  Adds a "Nut Guard" entry under the LuCI Services menu.
  Allows configuration of NUT connection settings via UCI,
  shows live UPS status, and provides start/stop/autostart controls.
endef

define Build/Prepare
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/luci-app-nut-guard/install
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/luci-app-nut-guard.json \
		$(1)/usr/share/luci/menu.d/luci-app-nut-guard.json

	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-nut-guard.json \
		$(1)/usr/share/rpcd/acl.d/luci-app-nut-guard.json

	$(INSTALL_DIR) $(1)/usr/libexec/rpcd
	$(INSTALL_BIN) ./root/usr/libexec/rpcd/luci.nut-guard \
		$(1)/usr/libexec/rpcd/luci.nut-guard

	$(INSTALL_DIR) $(1)/htdocs/luci-static/resources/view/nut-guard
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/nut-guard/overview.js \
		$(1)/htdocs/luci-static/resources/view/nut-guard/overview.js
endef

$(eval $(call BuildPackage,luci-app-nut-guard))
