include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-nut-guard
PKG_VERSION:=1.0.0
PKG_RELEASE:=1
PKG_MAINTAINER:=ospfx
PKG_LICENSE:=MIT

LUCI_TITLE:=LuCI support for Nut Guard UPS monitor
LUCI_DEPENDS:=+luci-base +nut-guard
LUCI_PKGARCH:=all

include ../../feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot
